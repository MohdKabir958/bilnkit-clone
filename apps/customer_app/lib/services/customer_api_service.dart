import 'package:kraveo_ui/kraveo_ui.dart' show GrozoAuthConfig, ClerkSessions;
import 'package:kraveo_ui/kraveo_ui.dart' show BrandConfig;
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:kraveo_ui/kraveo_ui.dart' show SecureSessionTokens;
import '../config/api_config.dart';
import '../models/auth_results.dart';
import '../models/food_category.dart';

/// A store-discovery failure with a safe, actionable message for the customer.
/// Never show raw HTML/proxy responses or assume an API failure means lost internet.
class CatalogLoadFailure implements Exception {
  const CatalogLoadFailure({
    required this.code,
    required this.message,
    this.statusCode,
  });

  final String code;
  final String message;
  final int? statusCode;

  bool get needsAddress =>
      code == 'ADDRESS_REQUIRED' ||
      code == 'AREA_UNSUPPORTED' ||
      code == 'ADDRESS_NOT_FOUND';

  factory CatalogLoadFailure.fromResponse(http.Response response) {
    Map<String, dynamic> body = {};
    try {
      final parsed = jsonDecode(response.body);
      if (parsed is Map) body = Map<String, dynamic>.from(parsed);
    } catch (_) {
      // A proxy or older server can return HTML. Do not show that to users.
    }
    final code = body['code'] is String ? body['code'] as String : '';
    final status = response.statusCode;
    if (code == 'ADDRESS_REQUIRED') {
      return const CatalogLoadFailure(
        code: 'ADDRESS_REQUIRED',
        message: 'Choose a delivery address to see nearby stores.',
        statusCode: 400,
      );
    }
    if (code == 'AREA_UNSUPPORTED') {
      return CatalogLoadFailure(
        code: code,
        message:
            'Grozo is not delivering to this address yet. Choose another delivery address.',
        statusCode: status,
      );
    }
    if (code == 'NOT_FOUND' && status == 404) {
      return CatalogLoadFailure(
        code: 'ADDRESS_NOT_FOUND',
        message: 'Your saved delivery address could not be found. Choose it again.',
        statusCode: status,
      );
    }
    if (status == 401) {
      return CatalogLoadFailure(
        code: 'SESSION_EXPIRED',
        message: 'Your session has expired. Sign in again to view nearby stores.',
        statusCode: status,
      );
    }
    if (status == 403) {
      return CatalogLoadFailure(
        code: 'CUSTOMER_ACCESS_REQUIRED',
        message:
            'This account cannot browse the Customer marketplace. Sign out and use an eligible customer account.',
        statusCode: status,
      );
    }
    if (status == 404) {
      return CatalogLoadFailure(
        code: 'SERVICE_VERSION_MISMATCH',
        message:
            'Store discovery is unavailable on this backend version. Grozo needs a compatible server deployment.',
        statusCode: status,
      );
    }
    if (status == 429) {
      return CatalogLoadFailure(
        code: 'STORE_RATE_LIMIT',
        message:
            'Grozo is receiving too many requests. Please retry in a moment.',
        statusCode: status,
      );
    }
    if (status >= 500) {
      return CatalogLoadFailure(
        code: 'STORE_SERVICE_UNAVAILABLE',
        message:
            'Grozo\'s store service is temporarily unavailable. Your internet connection may be fine. Please retry later.',
        statusCode: status,
      );
    }
    return CatalogLoadFailure(
      code: code.isEmpty ? 'STORE_REQUEST_FAILED' : code,
      message:
          'Grozo could not load stores for this request. Please choose a delivery address or retry.',
      statusCode: status,
    );
  }

  @override
  String toString() => 'CatalogLoadFailure($code, HTTP ${statusCode ?? "unknown"})';
}

class CustomerApiService {
  static String? selectedAddressId;
  static const String _tokenPrefKey = 'kraveo_customer_jwt_token';
  static String? _cachedToken;
  static int _tokenEpoch = 0;
  static int _profileEpoch = 0;

  /// Message shown (and thrown) when an authenticated call is rejected with HTTP 401.
  static const String sessionExpiredMessage =
      'Session expired, please log in again';

  /// Set by the app shell. Called after the stored token has been cleared because the
  /// backend answered 401 to an authenticated request.
  static void Function()? onUnauthorized;

  /// Test seam: route every request through a fake client.
  @visibleForTesting
  static http.Client? httpClientOverride;

  static Future<http.Response> _get(Uri url,
      {Map<String, String>? headers, required Duration timeout}) {
    final c = httpClientOverride;
    return (c == null
            ? http.get(url, headers: headers)
            : c.get(url, headers: headers))
        .timeout(timeout);
  }

  static Future<http.Response> _post(Uri url,
      {Map<String, String>? headers, Object? body, required Duration timeout}) {
    final c = httpClientOverride;
    return (c == null
            ? http.post(url, headers: headers, body: body)
            : c.post(url, headers: headers, body: body))
        .timeout(timeout);
  }

  static Future<http.Response> _put(Uri url,
      {Map<String, String>? headers, Object? body, required Duration timeout}) {
    final c = httpClientOverride;
    return (c == null
            ? http.put(url, headers: headers, body: body)
            : c.put(url, headers: headers, body: body))
        .timeout(timeout);
  }

  static Future<http.Response> _delete(Uri url,
      {Map<String, String>? headers, Object? body, required Duration timeout}) {
    final c = httpClientOverride;
    return (c == null
            ? http.delete(url, headers: headers, body: body)
            : c.delete(url, headers: headers, body: body))
        .timeout(timeout);
  }

  static Map<String, dynamic> _json(http.Response response) {
    try {
      final body = jsonDecode(response.body);
      if (body is Map) return Map<String, dynamic>.from(body);
    } catch (_) {}
    return const {};
  }

  static String? _msg(Map<String, dynamic> body) {
    final m = body['message'];
    return m is String && m.trim().isNotEmpty ? m.trim() : null;
  }

  /// Central 401 handling for authenticated calls: drop the dead token, tell the app shell.
  /// Returns true when the response was a 401.
  static Future<bool> _rejectIfUnauthorized(http.Response response) async {
    if (response.statusCode != 401) return false;
    await clearToken();
    onUnauthorized?.call();
    return true;
  }

  /// Retrieves the JWT from protected storage or the in-memory session cache
  static Future<String?> getSavedToken() async {
    if (GrozoAuthConfig.usesClerk) return ClerkSessions.instance.token();
    if (_cachedToken != null && _cachedToken!.isNotEmpty) {
      return _cachedToken;
    }
    final epoch = _tokenEpoch;
    try {
      final stored = await SecureSessionTokens.read(_tokenPrefKey);
      if (epoch != _tokenEpoch) return _cachedToken;
      _cachedToken = stored;
      return _cachedToken;
    } catch (_) {
      return _cachedToken;
    }
  }

  /// Saves JWT token to local persistence
  static Future<void> saveToken(String token) async {
    if (GrozoAuthConfig.usesClerk) {
      try {
        await SecureSessionTokens.delete(_tokenPrefKey);
      } catch (_) {}
      return;
    }
    _tokenEpoch++;
    _cachedToken = token;
    try {
      await SecureSessionTokens.write(_tokenPrefKey, token);
    } catch (_) {}
  }

  /// Clears the persisted student session after logout or token rejection.
  static Future<void> clearToken() async {
    _tokenEpoch++;
    _profileEpoch++;
    selectedAddressId = null;
    _cachedToken = null;
    try {
      await SecureSessionTokens.delete(_tokenPrefKey);
    } catch (_) {}
  }

  /// Validates the stored JWT against the backend and returns the profile.
  /// Returns null when there is no saved token. On 401 the token is cleared and
  /// [onUnauthorized] fires; on network trouble the token is kept so the user is not
  /// logged out just because they opened the app offline.
  static Future<ProfileResult?> fetchProfile() async {
    final epoch = ++_profileEpoch;
    try {
      final token = await getSavedToken();
      final identity = ClerkSessions.instance.identity.value;
      if (epoch != _profileEpoch) return null;
      if (token == null || token.isEmpty) return null;
      final response = await _get(
        Uri.parse('${ApiConfig.baseUrl}/auth/profile'),
        headers: {
          ...ApiConfig.clientHeaders,
          'Content-Type': 'application/json',
          'Authorization':
              token.startsWith('Bearer ') ? token : 'Bearer $token',
        },
        timeout: const Duration(seconds: 10),
      );
      final current = ClerkSessions.instance.identity.value;
      if (epoch != _profileEpoch ||
          (GrozoAuthConfig.usesClerk &&
              (identity.userId != current.userId ||
                  identity.sessionId != current.sessionId))) {
        return null;
      }
      if (await _rejectIfUnauthorized(response)) {
        return const ProfileResult(
            success: false, statusCode: 401, message: sessionExpiredMessage);
      }
      return _profileResult(response);
    } catch (e) {
      debugPrint('[Customer API] Session validation failed: $e');
      return const ProfileResult(success: false, networkError: true);
    }
  }

  static ProfileResult _profileResult(http.Response response) {
    final body = _json(response);
    final user = body['user'];
    final ok =
        response.statusCode == 200 && body['success'] != false && user is Map;
    return ProfileResult(
      success: ok,
      statusCode: response.statusCode,
      message: _msg(body),
      user: user is Map ? Map<String, dynamic>.from(user) : null,
      needsProfile: body['needsProfile'] == true,
      field: body['field']?.toString(),
    );
  }

  /// PUT /auth/profile with only the fields that are given. 400 responses carry `field` so the
  /// form can point at the input. [hostelBlock] is only accepted by the server when the student
  /// flag is (or becomes) true; it is cleared server-side when [isStudent] is false.
  static Future<ProfileResult> updateProfile({
    String? name,
    String? phone,
    bool? isStudent,
    String? hostelBlock,
    int? avatarId,
  }) async {
    final payload = <String, dynamic>{
      if (name != null) 'name': name,
      if (phone != null) 'phone': phone,
      if (isStudent != null) 'isStudent': isStudent,
      if (hostelBlock != null) 'hostelBlock': hostelBlock,
      if (avatarId != null) 'avatarId': avatarId,
    };
    try {
      final response = await _put(
        Uri.parse('${ApiConfig.baseUrl}/auth/profile'),
        headers: await getAuthHeaders(),
        body: jsonEncode(payload),
        timeout: const Duration(seconds: 10),
      );
      if (await _rejectIfUnauthorized(response)) {
        return const ProfileResult(
            success: false, statusCode: 401, message: sessionExpiredMessage);
      }
      return _profileResult(response);
    } catch (e) {
      debugPrint('[Customer API] Update profile failed: $e');
      return const ProfileResult(success: false, networkError: true);
    }
  }

  /// Tells the backend to forget this device's push token. Best-effort: the JWT is stateless,
  /// so callers clear the local session regardless of the outcome. Pass [token] when the local
  /// token may already have been cleared.
  static Future<ActionResult> logout({String? token}) async {
    try {
      final headers = <String, String>{'Content-Type': 'application/json'};
      final t = token ?? await getSavedToken();
      if (t != null && t.isNotEmpty) {
        headers['Authorization'] = t.startsWith('Bearer ') ? t : 'Bearer $t';
      }
      final response = await _post(
        Uri.parse('${ApiConfig.baseUrl}/auth/logout'),
        headers: headers,
        timeout: const Duration(seconds: 5),
      );
      final body = _json(response);
      return ActionResult(
          success: response.statusCode == 200 && body['success'] != false,
          statusCode: response.statusCode,
          message: _msg(body));
    } catch (e) {
      debugPrint('[Customer API] Logout notice failed (ignored): $e');
      return const ActionResult(success: false, networkError: true);
    }
  }

  /// Permanently anonymises the account. 409 means an order is still in progress.
  static Future<ActionResult> deleteAccount() async {
    try {
      final response = await _delete(
        Uri.parse('${ApiConfig.baseUrl}/auth/account'),
        headers: await getAuthHeaders(),
        timeout: const Duration(seconds: 15),
      );
      if (await _rejectIfUnauthorized(response)) {
        return const ActionResult(
            success: false, statusCode: 401, message: sessionExpiredMessage);
      }
      final body = _json(response);
      return ActionResult(
          success: response.statusCode == 200 && body['success'] != false,
          statusCode: response.statusCode,
          message: _msg(body));
    } catch (e) {
      debugPrint('[Customer API] Delete account failed: $e');
      return const ActionResult(success: false, networkError: true);
    }
  }

  /// Loads the public restaurant catalog, including database-backed menu IDs.
  static Future<List<Map<String, dynamic>>> fetchVendors(
      {bool hydrateProducts = true, String searchQuery = ''}) async {
    final vendors = <Map<String, dynamic>>[];
    final addressId = selectedAddressId;
    String? after;
    do {
      final query = Uri(queryParameters: {
        'limit': '50',
        'marketplace': '1',
        if (searchQuery.trim().isNotEmpty) 'q': searchQuery.trim(),
        if (addressId != null) 'addressId': addressId,
        if (after != null) 'after': after
      }).query;
      final response =
          await authorizedRequest('GET', '/v1/vendors/nearby?$query');
      final body = _json(response);
      if (response.statusCode != 200 || body['data'] is! List) {
        throw CatalogLoadFailure.fromResponse(response);
      }
      vendors.addAll((body['data'] as List)
          .whereType<Map>()
          .map((v) => Map<String, dynamic>.from(v)));
      after = body['nextCursor'] as String?;
    } while (after != null);
    for (final vendor in vendors) {
      if (!hydrateProducts || vendor['hasMoreProducts'] != true) continue;
      final items = (vendor['menuItems'] as List)
          .map((r) => Map<String, dynamic>.from(r as Map))
          .toList();
      String? cursor = items.isEmpty ? null : items.last['id'] as String;
      do {
        final query = Uri(queryParameters: {
          'limit': '50',
          if (addressId != null) 'addressId': addressId,
          if (cursor != null) 'after': cursor
        }).query;
        final response = await authorizedRequest('GET',
            '/v1/vendors/${Uri.encodeComponent(vendor['id'] as String)}/products?$query');
        final body = jsonDecode(response.body);
        if (response.statusCode != 200 ||
            body is! Map ||
            body['data'] is! List) {
          throw Exception(
              'Unable to load this store’s products. Retry before ordering.');
        }
        items.addAll((body['data'] as List)
            .whereType<Map>()
            .map((r) => Map<String, dynamic>.from(r)));
        cursor = body['nextCursor'] as String?;
      } while (cursor != null);
      vendor['menuItems'] = items;
    }
    return vendors;
  }

  /// One serviceable product page. Address ownership and stock remain server-validated.
  static Future<({List<Map<String, dynamic>> items, String? nextCursor})>
      fetchProductPage(String vendorId,
          {String query = '', String? after, String? categoryId}) async {
    final addressId = selectedAddressId;
    final params = Uri(queryParameters: {
      'limit': '50',
      if (addressId != null) 'addressId': addressId,
      if (query.isNotEmpty) 'q': query,
      if (categoryId != null) 'categoryId': categoryId,
      if (after != null) 'after': after
    }).query;
    final response = await authorizedRequest(
        'GET', '/v1/vendors/${Uri.encodeComponent(vendorId)}/products?$params');
    final body = jsonDecode(response.body);
    if (response.statusCode != 200 || body is! Map || body['data'] is! List) {
      throw Exception('Unable to load this store’s products. Please retry.');
    }
    return (
      items: (body['data'] as List)
          .whereType<Map>()
          .map((row) => Map<String, dynamic>.from(row))
          .toList(),
      nextCursor: body['nextCursor'] as String?
    );
  }

  /// Managed categories (`GET /categories?for=home|dishes|restaurants`, public, no login). Returns the
  /// parsed rows in the server's order; unusable rows are dropped. Throws when the call does not
  /// work out (offline, timeout, 404 on an old server, non-JSON, `success` false or `data` not a
  /// list): the caller falls back to today's behaviour.
  static Future<List<FoodCategory>> fetchCategories(
      {String forWhat = 'home'}) async {
    final response = await _get(
      Uri.parse('${ApiConfig.baseUrl}/categories')
          .replace(queryParameters: {'for': forWhat}),
      timeout: const Duration(seconds: 10),
    );
    if (response.statusCode != 200) {
      throw Exception('Categories unavailable (${response.statusCode}).');
    }
    final body = jsonDecode(response.body);
    if (body is! Map || body['success'] == false || body['data'] is! List) {
      throw Exception('Categories answer not understood.');
    }
    return FoodCategory.parseList(body['data']);
  }

  /// Builds authenticated request headers dynamically
  static Future<Map<String, String>> getAuthHeaders() async {
    final token = await getSavedToken();
    final headers = <String, String>{
      ...ApiConfig.clientHeaders,
      'Content-Type': 'application/json',
    };
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] =
          token.startsWith('Bearer ') ? token : 'Bearer $token';
    }
    return headers;
  }

  /// Exchanges a Google ID token for a Grozo session. On success the JWT is persisted
  /// before returning.
  static Future<GoogleLoginResult> googleSignIn(String idToken) async {
    try {
      final response = await _post(
        Uri.parse('${ApiConfig.baseUrl}/auth/google'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'idToken': idToken}),
        timeout: const Duration(seconds: 15),
      );
      final body = _json(response);
      final token = body['token'];
      final user = body['user'];
      final ok = response.statusCode == 200 &&
          body['success'] != false &&
          token is String &&
          token.isNotEmpty &&
          user is Map;
      if (!ok) {
        return GoogleLoginResult(
            success: false,
            statusCode: response.statusCode,
            message: _msg(body));
      }
      final userMap = Map<String, dynamic>.from(user);
      if (userMap['role'] != null && userMap['role'] != 'STUDENT') {
        return const GoogleLoginResult(
            success: false,
            statusCode: 403,
            message:
                'This Google account can\'t sign in to the ${BrandConfig.name} customer app.');
      }
      await saveToken(token);
      return GoogleLoginResult(
        success: true,
        statusCode: 200,
        token: token,
        user: userMap,
        isNewUser: body['isNewUser'] == true,
        needsProfile: body['needsProfile'] == true,
      );
    } catch (e) {
      debugPrint('[Customer API] Google sign-in failed: $e');
      return const GoogleLoginResult(success: false, networkError: true);
    }
  }

  /// Authenticated JSON request for the order/payment/review API (see `OrderApi`). Applies the
  /// Bearer token, the test client seam, a hard [timeout] and the central 401 handling (token
  /// cleared, [onUnauthorized] fired). Network failures and timeouts are thrown to the caller.
  /// With [handleUnauthorized] false a 401 is returned as is (used by best-effort calls such as
  /// removing the push token during sign-out, which must not start a second sign-out).
  static Future<http.Response> authorizedRequest(
    String method,
    String path, {
    Map<String, dynamic>? query,
    Object? body,
    Duration timeout = const Duration(seconds: 15),
    bool handleUnauthorized = true,
  }) async {
    var uri = Uri.parse('${ApiConfig.baseUrl}$path');
    if (query != null && query.isNotEmpty) {
      uri = uri.replace(queryParameters: {
        for (final e in query.entries)
          if (e.value != null) e.key: '${e.value}'
      });
    }
    final headers = await getAuthHeaders();
    final encoded = body == null ? null : jsonEncode(body);
    final http.Response response;
    switch (method) {
      case 'GET':
        response = await _get(uri, headers: headers, timeout: timeout);
      case 'POST':
        response =
            await _post(uri, headers: headers, body: encoded, timeout: timeout);
      case 'PUT':
        response =
            await _put(uri, headers: headers, body: encoded, timeout: timeout);
      case 'DELETE':
        response = await _delete(uri,
            headers: headers, body: encoded, timeout: timeout);
      default:
        throw ArgumentError.value(method, 'method');
    }
    if (handleUnauthorized) await _rejectIfUnauthorized(response);
    return response;
  }
}
