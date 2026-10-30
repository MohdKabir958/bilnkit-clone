import 'package:kraveo_ui/kraveo_ui.dart' show GrozoAuthConfig, ClerkSessions;
import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';
import '../models/partner_session.dart';

/// The role this app signs in as. The backend rejects a phone registered under another role.
const String kPartnerRole = 'VENDOR';

enum LoginFailure { invalidCredentials, locked, wrongRole, offline, server }

class LoginResult {
  const LoginResult.success(
      {required String this.token, required PartnerSession this.session})
      : failure = null,
        message = null,
        retryAfterSeconds = 0;

  const LoginResult.failure(LoginFailure this.failure,
      {this.message, this.retryAfterSeconds = 0})
      : token = null,
        session = null;

  final String? token;
  final PartnerSession? session;
  final LoginFailure? failure;

  /// Server-provided text (401 / 403 / 429) when there is one.
  final String? message;

  /// Seconds the phone stays locked (429 only).
  final int retryAfterSeconds;

  bool get ok => failure == null;
}

enum ProfileOutcome { valid, unauthorized, unreachable }

class ProfileResult {
  const ProfileResult(this.outcome, [this.session, this.message]);
  final String? message;
  final ProfileOutcome outcome;

  /// Account basics from the server (no vendor details) when [outcome] is valid.
  final PartnerSession? session;
}

/// What the restaurant fills in when it creates an account (and when it updates a rejected application).
class PartnerSignupForm {
  const PartnerSignupForm({
    required this.ownerName,
    required this.phone,
    required this.password,
    required this.restaurantName,
    required this.address,
    this.category = '',
    this.primaryCategoryId,
    this.fssaiNumber = '',
    this.lat,
    this.lng,
    this.locationAccuracyM,
    this.edited,
  });

  final String ownerName;
  final String phone;
  final String password;
  final String restaurantName;
  final String address;
  final String category;
  final String? primaryCategoryId;
  final String fssaiNumber;

  /// The kitchen's GPS position when the owner tapped "Use my current location" (optional; both or neither).
  final double? lat;
  final double? lng;

  /// How close the GPS said it was, in metres.
  final double? locationAccuracyM;

  /// When updating an application: which fields the owner actually changed (`name`, `restaurantName`, `address`,
  /// `category`, `fssaiNumber`). Null means "unknown": every non-empty field is sent.
  final Set<String>? edited;

  bool get hasLocation => lat != null && lng != null;

  /// Body for `POST /auth/partner-signup`.
  Map<String, dynamic> toSignupJson() => {
        'role': kPartnerRole,
        'name': ownerName,
        'phone': phone,
        'password': password,
        'restaurantName': restaurantName,
        'category': category,
        if (primaryCategoryId != null) 'primaryCategoryId': primaryCategoryId,
        'address': address,
        'fssaiNumber': fssaiNumber,
        // Only when detected, and always both coordinates (the server refuses half a location).
        if (hasLocation) ...{
          'lat': lat,
          'lng': lng,
          if (locationAccuracyM != null && locationAccuracyM!.isFinite)
            'locationAccuracyM':
                double.parse(locationAccuracyM!.toStringAsFixed(1)),
        },
      };

  /// Body for `PUT /partner/application` (phone and password cannot change there). The server merges the body over
  /// what it stores, so only fields the owner edited are sent, and an empty category / FSSAI number is never sent
  /// (it would wipe the stored value).
  Map<String, dynamic> toUpdateJson() {
    final all = <String, String>{
      'name': ownerName,
      'restaurantName': restaurantName,
      'address': address,
      'category': category,
      'fssaiNumber': fssaiNumber,
    };
    final out = <String, dynamic>{
      if (primaryCategoryId != null &&
          (edited == null || edited!.contains('primaryCategoryId')))
        'primaryCategoryId': primaryCategoryId,
    };
    all.forEach((key, value) {
      if (edited != null && !edited!.contains(key)) return;
      if ((key == 'category' || key == 'fssaiNumber') && value.trim().isEmpty) {
        return;
      }
      out[key] = value;
    });
    return out;
  }
}

enum SignupFailure {
  invalid,
  phoneTaken,
  rateLimited,
  unauthorized,
  offline,
  server
}

/// Outcome of creating an account or re-sending an application.
class SignupResult {
  const SignupResult.success({this.token, this.session})
      : failure = null,
        field = null,
        message = null;

  const SignupResult.failure(SignupFailure this.failure,
      {this.field, this.message})
      : token = null,
        session = null;

  /// Present for a new account (sign-up); null when an existing account re-sent its application.
  final String? token;

  /// The account as the server answered. Always present for sign-up; for a re-sent application it can be null when the
  /// server's 200 carries no readable `user` (the caller then re-reads the profile).
  final PartnerSession? session;
  final SignupFailure? failure;

  /// Which form field the server complained about (`restaurantName`, `phone`, ...), when it said.
  final String? field;
  final String? message;

  bool get ok => failure == null;
}

/// Network side of partner authentication. The session controller talks only to this
/// interface, so tests can drive every state with a fake.
abstract class PartnerAuthService {
  Future<LoginResult> login({required String phone, required String password});

  /// Validates a stored token and returns the account with its approval state (`GET /partner/me`).
  Future<ProfileResult> fetchProfile(String token);

  /// Creates a restaurant account; it starts out pending approval (`POST /auth/partner-signup`).
  Future<SignupResult> signUp(PartnerSignupForm form);

  /// Fixes and re-sends an application that is pending or was rejected (`PUT /partner/application`).
  Future<SignupResult> resubmit(String token, PartnerSignupForm form);

  /// Best effort `POST /auth/logout`; never throws.
  Future<void> logout(String token);
}

class ApiPartnerAuthService implements PartnerAuthService {
  ApiPartnerAuthService({http.Client? client})
      : _client = client ?? http.Client();
  final http.Client _client;

  static const Duration _loginTimeout = Duration(seconds: 12);

  static Map<String, dynamic>? _decode(String body) {
    try {
      final decoded = jsonDecode(body);
      return decoded is Map<String, dynamic> ? decoded : null;
    } catch (_) {
      return null;
    }
  }

  @override
  Future<LoginResult> login(
      {required String phone, required String password}) async {
    if (GrozoAuthConfig.usesClerk) {
      try {
        final token = await ClerkSessions.instance.token();
        if (token == null) {
          return const LoginResult.failure(LoginFailure.invalidCredentials,
              message: 'Sign in with Clerk first.');
        }
        final result = await fetchProfile(token);
        if (result.outcome == ProfileOutcome.valid && result.session != null) {
          return LoginResult.success(token: token, session: result.session!);
        }
        return LoginResult.failure(
            result.outcome == ProfileOutcome.unreachable
                ? LoginFailure.offline
                : LoginFailure.wrongRole,
            message: result.message ??
                'Could not load your store. Check your connection and retry.');
      } catch (_) {
        return const LoginResult.failure(LoginFailure.offline);
      }
    }

    final http.Response response;
    try {
      response = await _client
          .post(
            Uri.parse('${ApiConfig.baseUrl}/auth/partner-login'),
            headers: {
              ...ApiConfig.clientHeaders,
              'Content-Type': 'application/json'
            },
            body: jsonEncode(
                {'phone': phone, 'password': password, 'role': kPartnerRole}),
          )
          .timeout(_loginTimeout);
    } catch (_) {
      return const LoginResult.failure(LoginFailure.offline);
    }

    final json = _decode(response.body);
    final message =
        json?['message'] is String ? json!['message'] as String : null;
    switch (response.statusCode) {
      case 200:
        final token = json?['token'];
        final session =
            json == null ? null : PartnerSession.fromLoginJson(json);
        if (token is String && token.isNotEmpty && session != null) {
          return LoginResult.success(token: token, session: session);
        }
        return const LoginResult.failure(LoginFailure.server);
      case 400:
      case 401:
        return LoginResult.failure(LoginFailure.invalidCredentials,
            message: message);
      case 403:
        return LoginResult.failure(LoginFailure.wrongRole, message: message);
      case 429:
        final raw = json?['retryAfterSeconds'];
        final seconds = raw is num ? raw.toInt() : 0;
        return LoginResult.failure(LoginFailure.locked,
            message: message, retryAfterSeconds: seconds < 1 ? 60 : seconds);
      default:
        return const LoginResult.failure(LoginFailure.server);
    }
  }

  @override
  Future<SignupResult> signUp(PartnerSignupForm form) async {
    if (GrozoAuthConfig.usesClerk) {
      try {
        final token = await ClerkSessions.instance.token();
        if (token == null) {
          return const SignupResult.failure(SignupFailure.unauthorized);
        }
        final body = form.toSignupJson()..remove('password');
        final response = await _client
            .post(Uri.parse('${ApiConfig.baseUrl}/partner/clerk-application'),
                headers: {
                  ...ApiConfig.clientHeaders,
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer $token'
                },
                body: jsonEncode(body))
            .timeout(_loginTimeout);
        final result = _signupResult(response, expectToken: false);
        if (!result.ok) return result;
        if (result.session?.vendorId == null) {
          return const SignupResult.failure(SignupFailure.server,
              message:
                  'Grozo could not confirm the store application. Retry to check its status.');
        }
        return SignupResult.success(token: token, session: result.session);
      } catch (_) {
        return const SignupResult.failure(SignupFailure.offline);
      }
    }

    final http.Response response;
    try {
      response = await _client
          .post(
            Uri.parse('${ApiConfig.baseUrl}/auth/partner-signup'),
            headers: {
              ...ApiConfig.clientHeaders,
              'Content-Type': 'application/json'
            },
            body: jsonEncode(form.toSignupJson()),
          )
          .timeout(_loginTimeout);
    } catch (_) {
      return const SignupResult.failure(SignupFailure.offline);
    }
    return _signupResult(response, expectToken: true);
  }

  @override
  Future<SignupResult> resubmit(String token, PartnerSignupForm form) async {
    final http.Response response;
    try {
      response = await _client
          .put(
            Uri.parse('${ApiConfig.baseUrl}/partner/application'),
            headers: {
              ...ApiConfig.clientHeaders,
              'Content-Type': 'application/json',
              'Authorization': 'Bearer $token'
            },
            body: jsonEncode(form.toUpdateJson()),
          )
          .timeout(_loginTimeout);
    } catch (_) {
      return const SignupResult.failure(SignupFailure.offline);
    }
    return _signupResult(response, expectToken: false);
  }

  SignupResult _signupResult(http.Response response,
      {required bool expectToken}) {
    final json = _decode(response.body);
    final message =
        json?['message'] is String ? json!['message'] as String : null;
    final field = json?['field'] is String ? json!['field'] as String : null;
    switch (response.statusCode) {
      case 200:
      case 201:
        final session = json == null ? null : PartnerSession.fromMeJson(json);
        final token = json?['token'];
        if (expectToken) {
          if (session == null || token is! String || token.isEmpty) {
            return const SignupResult.failure(SignupFailure.server);
          }
          return SignupResult.success(token: token, session: session);
        }
        // Re-sent application: the server accepted it (200). A body without a readable `user` is still a success.
        return SignupResult.success(session: session);
      case 400:
        return SignupResult.failure(SignupFailure.invalid,
            field: field, message: message);
      case 401:
        return SignupResult.failure(SignupFailure.unauthorized,
            message: message);
      case 403:
        return SignupResult.failure(SignupFailure.invalid,
            message: message ??
                'This account cannot apply for a store. Use a separate store-owner account.');
      case 409:
        return SignupResult.failure(
            field == 'phone' ? SignupFailure.phoneTaken : SignupFailure.invalid,
            field: field,
            message: message);
      case 429:
        return SignupResult.failure(SignupFailure.rateLimited,
            message: message);
      default:
        return const SignupResult.failure(SignupFailure.server);
    }
  }

  @override
  Future<ProfileResult> fetchProfile(String token) async {
    try {
      final response = await _client.get(
        Uri.parse(
            '${ApiConfig.baseUrl}${GrozoAuthConfig.usesClerk ? '/partner/vendor/onboarding' : '/partner/me'}'),
        headers: {
          ...ApiConfig.clientHeaders,
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token'
        },
      ).timeout(const Duration(seconds: 10));
      final json = _decode(response.body);
      final message = json?['message'] as String?;
      if (response.statusCode == 401 ||
          response.statusCode == 403 ||
          response.statusCode == 409) {
        return ProfileResult(ProfileOutcome.unauthorized, null, message);
      }
      if (response.statusCode != 200) {
        return ProfileResult(ProfileOutcome.unreachable, null, message);
      }
      final session = json == null ? null : PartnerSession.fromMeJson(json);
      if (session == null) {
        return const ProfileResult(ProfileOutcome.unreachable);
      }
      // A token that belongs to another role must not open this app.
      final role = (json!['user'] as Map)['role']?.toString();
      if (session.requiresApplication) {
        if (!GrozoAuthConfig.usesClerk ||
            role != 'STUDENT' ||
            session.vendorId != null) {
          return const ProfileResult(ProfileOutcome.unauthorized);
        }
      } else if (role != null && role != kPartnerRole) {
        return const ProfileResult(ProfileOutcome.unauthorized);
      }
      return ProfileResult(ProfileOutcome.valid, session);
    } catch (_) {
      return const ProfileResult(ProfileOutcome.unreachable);
    }
  }

  @override
  Future<void> logout(String token) async {
    try {
      await _client.post(
        Uri.parse('${ApiConfig.baseUrl}/auth/logout'),
        headers: {
          ...ApiConfig.clientHeaders,
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token'
        },
      ).timeout(const Duration(seconds: 4));
    } catch (_) {}
  }
}
