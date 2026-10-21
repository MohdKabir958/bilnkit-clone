import 'package:customer_app/models/delivery_address.dart';
import 'package:customer_app/screens/addresses_screen.dart';
import 'dart:async';
import 'dart:convert';
import 'dart:io' show SocketException;

import 'package:customer_app/main.dart';
import 'package:customer_app/models/customer_user.dart';
import 'package:customer_app/models/menu_item.dart';
import 'package:customer_app/providers/cart_provider.dart';
import 'package:customer_app/providers/dhaba_provider.dart';
import 'package:customer_app/providers/order_provider.dart';
import 'package:customer_app/providers/session_provider.dart';
import 'package:customer_app/screens/auth_screen.dart';
import 'package:customer_app/screens/profile_screen.dart';
import 'package:customer_app/screens/profile_setup_screen.dart';
import 'package:customer_app/screens/checkout_screen.dart';
import 'package:customer_app/services/google_auth_service.dart';
import 'package:customer_app/widgets/ui/google_button.dart';
import 'package:customer_app/services/customer_api_service.dart';
import 'package:customer_app/services/order_api.dart';
import 'package:customer_app/widgets/ui/hostel_pill.dart';
import 'package:customer_app/widgets/ui/phone_input.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:customer_app/config/app_info.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// In-memory stand-in for the Grozo backend. Routes are "METHOD /path-after-/api".
class FakeBackend {
  final List<http.Request> requests = [];
  final Map<String, http.Response Function(http.Request)> routes = {};

  void on(String route, http.Response Function(http.Request) handler) =>
      routes[route] = handler;

  MockClient get client => MockClient((req) async {
        requests.add(req);
        final path = req.url.path.replaceFirst(RegExp(r'^/api'), '');
        final handler = routes['${req.method} $path'];
        if (handler == null) {
          return http.Response('{"success":false,"message":"no route"}', 404);
        }
        return handler(req);
      });

  Iterable<http.Request> to(String route) => requests.where((r) =>
      '${r.method} ${r.url.path.replaceFirst(RegExp(r'^/api'), '')}' == route);
  Map<String, dynamic> bodyOf(http.Request r) =>
      jsonDecode(r.body) as Map<String, dynamic>;
}

http.Response reply(int status, Map<String, dynamic> body) =>
    http.Response(jsonEncode(body), status,
        headers: {'content-type': 'application/json'});

Map<String, dynamic> userJson({
  String? name = 'Aarav Sharma',
  String? hostel = 'Block 2',
  int coins = 120,
  String? phone = '+91 9876543210',
  String? email = 'aarav@example.com',
  bool? isStudent = true,
  int? avatarId = 3,
  String role = 'STUDENT',
}) =>
    {
      'id': 'u1',
      'name': name,
      'email': email,
      'phone': phone,
      'role': role,
      'isStudent': isStudent,
      'hostelBlock': hostel,
      'avatarId': avatarId,
      'kraveoCoins': coins,
    };

Map<String, dynamic> addressJson(
        {String id = 'address-home',
        String label = 'Home',
        String house = 'Flat 14',
        bool selected = true}) =>
    {
      'id': id,
      'customerId': 'u1',
      'cityId': 'blr',
      'city': {'id': 'blr', 'name': 'Bengaluru', 'state': 'Karnataka'},
      'country': 'IN',
      'label': label,
      'pinCode': '560001',
      'locality': 'Central',
      'houseNumber': house,
      'street': 'Main Road',
      'lat': 12.97,
      'lng': 77.59,
      'isDefault': selected,
    };

/// A brand-new Google account: nothing but e-mail filled in.
Map<String, dynamic> blankUserJson() => userJson(
    name: null, phone: null, hostel: null, isStudent: null, avatarId: null);

/// Scriptable stand-in for the Google sign-in layer (the only thing the app mocks natively).
class FakeGoogleAuth implements GoogleAuthService {
  GoogleAuthResult next = const GoogleAuthResult.success(GoogleCredential(
      idToken: 'google-id-token',
      email: 'aarav@example.com',
      displayName: 'Aarav Sharma'));
  int signInCalls = 0;
  int signOutCalls = 0;

  /// When set, signIn() waits for it (to observe the in-flight state).
  Completer<void>? gate;

  @override
  Future<GoogleAuthResult> signIn() async {
    signInCalls++;
    if (gate != null) await gate!.future;
    return next;
  }

  @override
  Future<void> signOut() async => signOutCalls++;
}

/// Implements the Auth v2 contract for the parts the app touches, so whole-flow tests exercise
/// the real needsProfile rules instead of hand-written answers.
class FakeServer {
  FakeServer(this.backend, {Map<String, dynamic>? seed, this.isNewUser = true})
      : user = {...(seed ?? blankUserJson())} {
    backend.on(
        'POST /auth/google',
        (_) => reply(200, {
              'success': true,
              'token': 'jwt-google',
              'user': user,
              'isNewUser': isNewUser,
              'needsProfile': needsProfile
            }));
    backend.on(
        'GET /auth/profile',
        (_) => reply(200,
            {'success': true, 'user': user, 'needsProfile': needsProfile}));
    backend.on('PUT /auth/profile', (req) {
      final b = jsonDecode(req.body) as Map<String, dynamic>;
      putBodies.add(b);
      if (b.containsKey('name')) user['name'] = b['name'];
      if (b.containsKey('phone')) {
        user['phone'] = '+91 ${normalizeIndianPhone(b['phone'] as String)}';
      }
      if (b.containsKey('avatarId')) user['avatarId'] = b['avatarId'];
      if (b.containsKey('isStudent')) user['isStudent'] = b['isStudent'];
      if (user['isStudent'] == false) {
        user['hostelBlock'] = null;
      } else if (user['isStudent'] == true && b.containsKey('hostelBlock')) {
        user['hostelBlock'] = b['hostelBlock'];
      }
      return reply(
          200, {'success': true, 'user': user, 'needsProfile': needsProfile});
    });
    backend.on('GET /v1/addresses',
        (_) => reply(200, {'success': true, 'data': [], 'nextCursor': null}));
    backend.on('GET /v1/vendors/nearby', (_) => reply(500, {'success': false}));
    backend.on('POST /auth/logout', (_) => reply(200, {'success': true}));
  }

  final FakeBackend backend;
  final Map<String, dynamic> user;
  final bool isNewUser;
  final List<Map<String, dynamic>> putBodies = [];

  bool get needsProfile =>
      user['role'] == 'STUDENT' &&
      (user['name'] == null ||
          user['phone'] == null ||
          user['avatarId'] == null);
}

Future<void> loadKraveoFonts() async {
  const fonts = {
    'packages/kraveo_ui/Bricolage':
        'packages/kraveo_ui/assets/fonts/BricolageGrotesque.ttf',
    'packages/kraveo_ui/Jakarta':
        'packages/kraveo_ui/assets/fonts/PlusJakartaSans.ttf',
  };
  for (final entry in fonts.entries) {
    final loader = FontLoader(entry.key)..addFont(rootBundle.load(entry.value));
    await loader.load();
  }
}

/// 360x640 at 1.3x text: any overflow or build error fails the test.
void smallPhone(WidgetTester tester) {
  tester.view.physicalSize = const Size(360, 640);
  tester.view.devicePixelRatio = 1.0;
  tester.platformDispatcher.textScaleFactorTestValue = 1.3;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
    tester.platformDispatcher.clearTextScaleFactorTestValue();
  });
}

SessionProvider newSession({FakeGoogleAuth? google}) => SessionProvider(
    initial: SessionStatus.signedOut, googleAuth: google ?? FakeGoogleAuth());

Future<void> pumpWithProviders(
  WidgetTester tester,
  Widget child, {
  SessionProvider? session,
  CartProvider? cart,
  OrderProvider? orders,
  double textScale = 1,
}) async {
  smallPhone(tester);
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<SessionProvider>.value(
            value: session ?? newSession()),
        ChangeNotifierProvider<DhabaProvider>(create: (_) => DhabaProvider()),
        ChangeNotifierProvider<CartProvider>.value(
            value: cart ?? CartProvider()),
        ChangeNotifierProvider<OrderProvider>.value(
            value: orders ?? OrderProvider()),
      ],
      child: MaterialApp(
          theme: KraveoTheme.customer(),
          builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: TextScaler.linear(textScale)),
              child: child!),
          home: child),
    ),
  );
  await tester.pump(const Duration(milliseconds: 800));
}

Future<void> settle(WidgetTester tester, [int ms = 600]) async {
  await tester.pump();
  await tester.pump(Duration(milliseconds: ms));
}

Finder kAvatarWithId(int? id) =>
    find.byWidgetPredicate((w) => w is KAvatar && w.id == id);

/// Scrolls the page's main list until [finder] is built and on screen, then taps it.
Future<void> tapScrolled(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(finder, 150,
      scrollable: find.byType(Scrollable).first);
  await tester.ensureVisible(finder);
  await tester.pump();
  await tester.tap(finder);
  await settle(tester);
}

bool isDisabled(WidgetTester tester, String label) =>
    tester.widget<KButton>(find.widgetWithText(KButton, label)).onPressed ==
    null;

void main() {
  setUpAll(loadKraveoFonts);

  late FakeBackend backend;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await CustomerApiService.clearToken();
    backend = FakeBackend();
    CustomerApiService.httpClientOverride = backend.client;
    CustomerApiService.onUnauthorized = null;
  });

  tearDown(() {
    CustomerApiService.httpClientOverride = null;
    CustomerApiService.onUnauthorized = null;
  });

  group('models and helpers', () {
    test('maskedPhone hides the middle digits for any stored format', () {
      for (final raw in [
        '+919876543210',
        '+91 9876543210',
        '919876543210',
        '9876543210'
      ]) {
        expect(
            CustomerUser(id: '1', phone: raw).maskedPhone, '+91 98••• ••210');
      }
      expect(const CustomerUser(id: '1').maskedPhone, '');
    });

    test('initials and first name', () {
      expect(const CustomerUser(id: '1', name: 'Aarav  Kumar Sharma').initials,
          'AS');
      expect(const CustomerUser(id: '1', name: 'meera').initials, 'M');
      expect(
          const CustomerUser(id: '1', name: 'Aarav Sharma').firstName, 'Aarav');
      expect(const CustomerUser(id: '1').initials, 'K');
    });

    test('fromJson parses the v2 user object, including nulls', () {
      final full = CustomerUser.fromJson(userJson());
      expect(full.email, 'aarav@example.com');
      expect(full.phone, '+91 9876543210');
      expect(full.isStudent, isTrue);
      expect(full.avatarId, 3);
      expect(full.hostelBlock, 'Block 2');
      expect(full.kraveoCoins, 120);

      final blank = CustomerUser.fromJson(blankUserJson());
      expect(blank.name, isNull);
      expect(blank.phone, isNull);
      expect(blank.isStudent, isNull);
      expect(blank.avatarId, isNull);
      expect(blank.hostelBlock, isNull);

      expect(
          CustomerUser.fromJson(userJson(isStudent: false, hostel: null))
              .isStudent,
          isFalse);
      expect(CustomerUser.fromJson({...userJson(), 'avatarId': 99}).avatarId,
          isNull,
          reason: 'out of range is ignored');
      expect(
          CustomerUser.fromJson({...userJson(), 'avatarId': '7'}).avatarId, 7);
      expect(
          CustomerUser.fromJson({...userJson(), 'phone': '  ', 'email': ''})
              .phone,
          isNull);
    });

    test('copyWith can clear the hostel', () {
      final u = CustomerUser.fromJson(userJson());
      expect(u.copyWith(avatarId: 9).avatarId, 9);
      expect(u.copyWith(clearHostelBlock: true, isStudent: false).hostelBlock,
          isNull);
      expect(u.copyWith(name: 'Z').hostelBlock, 'Block 2');
    });

    test('legacy hostel names map onto the drop-off list', () {
      // Drop points are now BH1..BH8 / Special Block / GH1, GH2; the old spellings migrate.
      expect(normalizeHostelBlock('Boys Hostel Block 3', kHostelBlocks), 'BH3');
      expect(normalizeHostelBlock('block 6', kHostelBlocks), 'BH6');
      expect(normalizeHostelBlock('Block 2', kHostelBlocks), 'BH2');
      expect(normalizeHostelBlock('girls hostel gate 2', kHostelBlocks), 'GH2');
      expect(normalizeHostelBlock('VIT Main Gate', kHostelBlocks), isNull,
          reason: 'removed: the student is asked to choose again');
      expect(normalizeHostelBlock('Block 42', kHostelBlocks), isNull);
      expect(normalizeHostelBlock('Somewhere else', kHostelBlocks), isNull);
      expect(normalizeHostelBlock(null, kHostelBlocks), isNull);
    });

    test('phone normaliser strips country code and formatting', () {
      expect(normalizeIndianPhone('+91 98765 43210'), '9876543210');
      expect(normalizeIndianPhone('+91 9876543210'), '9876543210');
      expect(normalizeIndianPhone('919876543210'), '9876543210');
      expect(normalizeIndianPhone('09876543210'), '9876543210');
      expect(normalizeIndianPhone('98765abc43210999'), '9876543210');
      expect(validateIndianMobile('9876543210'), isNull);
      expect(validateIndianMobile('5876543210'),
          contains('start with 6, 7, 8 or 9'));
      expect(validateIndianMobile('98765'), contains('10-digit'));
    });

    test(
        'name validation follows the server rule (backend/src/utils/names.ts): any-script letters, marks, digits, space . \' ’ -, 2-60 chars, first a letter',
        () {
      expect(validateFullName(''), isNotNull);
      expect(validateFullName(' A '), isNotNull);
      expect(validateFullName('12'), isNotNull,
          reason: 'must start with a letter');
      expect(validateFullName('2Pac'), isNotNull);
      expect(validateFullName('Al'), isNull);
      expect(validateFullName('Aarav Sharma'), isNull);
      expect(validateFullName("Mary-Jane O'Neil Jr."), isNull);
      // what the server accepts and Google fills in
      expect(validateFullName('Aarav 2'), isNull, reason: 'digits are allowed');
      expect(validateFullName('RAHUL SHARMA 22BCE10123'), isNull);
      expect(validateFullName('Joan D\u2019Souza'), isNull,
          reason: 'curly apostrophe');
      expect(validateFullName('राहुल शर्मा'), isNull,
          reason: 'Devanagari letters and vowel marks');
      expect(validateFullName('  Aarav    Sharma  '), isNull,
          reason: 'whitespace is collapsed first');
      expect(validateFullName('Aarav<script>'), contains('Use letters'));
      expect(validateFullName('Aarav 😀'), contains('Use letters'));
      expect(validateFullName('Aarav_Kumar'), contains('Use letters'));
      expect(validateFullName('x' * 60), isNull);
      expect(validateFullName('x' * 61), isNotNull);
    });

    test('Google failures map to plain sentences and a cancel stays silent',
        () {
      expect(googleFailureMessage(GoogleAuthFailure.cancelled), isNull);
      expect(googleFailureMessage(GoogleAuthFailure.noNetwork),
          contains('connection'));
      expect(googleFailureMessage(GoogleAuthFailure.playServices),
          contains('Google Play services'));
      expect(googleFailureMessage(GoogleAuthFailure.notConfigured),
          contains('set up correctly'));
      expect(googleFailureMessage(GoogleAuthFailure.other), isNotNull);
    });
  });

  group('CustomerApiService', () {
    test(
        'googleSignIn posts the ID token, stores the JWT and returns the typed user',
        () async {
      backend.on(
          'POST /auth/google',
          (_) => reply(200, {
                'success': true,
                'token': 'jwt-1',
                'user': blankUserJson(),
                'isNewUser': true,
                'needsProfile': true
              }));
      final r = await CustomerApiService.googleSignIn('google-id-token');
      expect(r.success, isTrue);
      expect(r.isNewUser, isTrue);
      expect(r.needsProfile, isTrue);
      expect(r.user?['email'], 'aarav@example.com');
      expect(backend.bodyOf(backend.requests.single),
          {'idToken': 'google-id-token'});
      expect(backend.requests.single.headers.containsKey('Authorization'),
          isFalse);
      expect(await CustomerApiService.getSavedToken(), 'jwt-1');
    });

    test(
        'googleSignIn failures carry the server message and never save a token',
        () async {
      backend.on(
          'POST /auth/google',
          (_) =>
              reply(401, {'success': false, 'message': 'Email not verified'}));
      var r = await CustomerApiService.googleSignIn('x');
      expect(r.success, isFalse);
      expect(r.rejected, isTrue);
      expect(r.message, 'Email not verified');

      backend.on(
          'POST /auth/google',
          (_) => reply(
              403, {'success': false, 'message': 'This is a partner account'}));
      r = await CustomerApiService.googleSignIn('x');
      expect(r.roleNotAllowed, isTrue);
      expect(r.message, 'This is a partner account');

      backend.on(
          'POST /auth/google',
          (_) => reply(200, {
                'success': true,
                'token': 't',
                'user': userJson(role: 'VENDOR')
              }));
      r = await CustomerApiService.googleSignIn('x');
      expect(r.success, isFalse,
          reason: 'a non-student role is refused even on a 200');
      expect(r.roleNotAllowed, isTrue);

      backend.on('POST /auth/google', (_) => reply(503, {'success': false}));
      r = await CustomerApiService.googleSignIn('x');
      expect(r.unavailable, isTrue);

      backend.on(
          'POST /auth/google', (_) => throw http.ClientException('offline'));
      r = await CustomerApiService.googleSignIn('x');
      expect(r.networkError, isTrue);
      expect(await CustomerApiService.getSavedToken(), isNull);
    });

    test('updateProfile sends only the fields given, with the Bearer token',
        () async {
      await CustomerApiService.saveToken('jwt-9');
      backend.on(
          'PUT /auth/profile',
          (_) => reply(200,
              {'success': true, 'user': userJson(), 'needsProfile': false}));
      await CustomerApiService.updateProfile(avatarId: 7);
      expect(backend.bodyOf(backend.requests.last), {'avatarId': 7});
      expect(backend.requests.last.headers['Authorization'], 'Bearer jwt-9');

      await CustomerApiService.updateProfile(
          name: 'Aarav Sharma',
          phone: '9876543210',
          isStudent: true,
          hostelBlock: 'Block 3',
          avatarId: 4);
      expect(backend.bodyOf(backend.requests.last), {
        'name': 'Aarav Sharma',
        'phone': '9876543210',
        'isStudent': true,
        'hostelBlock': 'Block 3',
        'avatarId': 4
      });

      await CustomerApiService.updateProfile(isStudent: false);
      expect(backend.bodyOf(backend.requests.last), {'isStudent': false});
    });

    test('profile errors surface the field so the form can point at the input',
        () async {
      await CustomerApiService.saveToken('jwt-9');
      backend.on(
          'PUT /auth/profile',
          (_) => reply(400, {
                'success': false,
                'message': 'Enter a valid mobile number',
                'field': 'phone'
              }));
      final r = await CustomerApiService.updateProfile(phone: '123');
      expect(r.success, isFalse);
      expect(r.field, 'phone');
      expect(r.message, 'Enter a valid mobile number');
    });

    test('deleteAccount reports the 409 conflict message', () async {
      await CustomerApiService.saveToken('jwt-9');
      backend.on(
          'DELETE /auth/account',
          (_) => reply(
              409, {'success': false, 'message': 'Finish your order first'}));
      final r = await CustomerApiService.deleteAccount();
      expect(r.success, isFalse);
      expect(r.conflict, isTrue);
      expect(r.message, 'Finish your order first');
      expect(await CustomerApiService.getSavedToken(), 'jwt-9',
          reason: 'a refused deletion must not sign the student out');
    });

    test(
        'HTTP 401 on authenticated calls clears the token and fires onUnauthorized',
        () async {
      var fired = 0;
      CustomerApiService.onUnauthorized = () => fired++;
      backend.on('POST /v2/checkout',
          (_) => reply(401, {'success': false, 'message': 'jwt expired'}));
      backend.on(
          'POST /payments/create-order', (_) => reply(401, {'success': false}));
      backend.on('POST /payments/verify-signature',
          (_) => reply(401, {'success': false}));
      backend.on('GET /auth/profile', (_) => reply(401, {'success': false}));
      backend.on('PUT /auth/profile', (_) => reply(401, {'success': false}));
      backend.on('DELETE /auth/account', (_) => reply(401, {'success': false}));

      Future<void> expectExpired(Future<Object?> Function() call) async {
        await CustomerApiService.saveToken('jwt-old');
        final before = fired;
        try {
          await call();
        } catch (e) {
          expect(
              e.toString(), contains(CustomerApiService.sessionExpiredMessage));
        }
        expect(fired, before + 1);
        expect(await CustomerApiService.getSavedToken(), isNull);
      }

      const api = HttpOrderApi();
      Future<Object?> expectOrderUnauthorized(
          Future<OrderResult<Object?>> call) async {
        final r = await call;
        expect(r.error?.kind, OrderErrorKind.unauthorized);
        expect(orderErrorMessage(r.error!),
            CustomerApiService.sessionExpiredMessage);
        return r;
      }

      await expectExpired(() => expectOrderUnauthorized(api.createOrder(
          const CreateOrderRequest(
              vendorId: 'v',
              items: [],
              dropoffHostel: 'Block 1',
              dropoffNotes: '',
              clientRequestId: 'k1'))));
      await expectExpired(
          () => expectOrderUnauthorized(api.createPayment('o1')));
      await expectExpired(() => expectOrderUnauthorized(api.verifyPayment(
          const PaymentProof(
              razorpayOrderId: 'a',
              razorpayPaymentId: 'b',
              razorpaySignature: 'c'))));
      await expectExpired(() async {
        final r = await CustomerApiService.fetchProfile();
        expect(r?.unauthorized, isTrue);
        return r;
      });
      await expectExpired(() async {
        final r = await CustomerApiService.updateProfile(name: 'Aarav');
        expect(r.unauthorized, isTrue);
        return r;
      });
      await expectExpired(() async {
        final r = await CustomerApiService.deleteAccount();
        expect(r.unauthorized, isTrue);
        return r;
      });
    });

    test('fetchProfile keeps the token when the network is down', () async {
      await CustomerApiService.saveToken('jwt-keep');
      backend.on(
          'GET /auth/profile', (_) => throw http.ClientException('offline'));
      final r = await CustomerApiService.fetchProfile();
      expect(r?.networkError, isTrue);
      expect(await CustomerApiService.getSavedToken(), 'jwt-keep');
    });
  });

  group('SessionProvider Google sign-in', () {
    test('new account: token saved, status needsProfile, Google name suggested',
        () async {
      final server = FakeServer(backend);
      final google = FakeGoogleAuth();
      final s = newSession(google: google);
      final outcome = await s.signInWithGoogle();
      expect(outcome.success, isTrue);
      expect(s.status, SessionStatus.needsProfile);
      expect(s.user?.email, 'aarav@example.com');
      expect(s.suggestedName, 'Aarav Sharma');
      expect(await CustomerApiService.getSavedToken(), 'jwt-google');
      expect(server.putBodies, isEmpty);
      expect(backend.bodyOf(backend.to('POST /auth/google').single),
          {'idToken': 'google-id-token'});
    });

    test('returning student goes straight to signedIn and seeds onUserLoaded',
        () async {
      FakeServer(backend, seed: userJson(), isNewUser: false);
      final s = newSession();
      CustomerUser? loaded;
      s.onUserLoaded = (u) => loaded = u;
      await s.signInWithGoogle();
      expect(s.status, SessionStatus.signedIn);
      expect(loaded?.kraveoCoins, 120);
      expect(s.suggestedName, 'Aarav Sharma');
    });

    test('cancelling the Google picker is silent and sends nothing', () async {
      final google = FakeGoogleAuth()
        ..next = const GoogleAuthResult.failed(GoogleAuthFailure.cancelled);
      final s = newSession(google: google);
      final outcome = await s.signInWithGoogle();
      expect(outcome.cancelled, isTrue);
      expect(outcome.error, isNull);
      expect(s.status, SessionStatus.signedOut);
      expect(backend.requests, isEmpty);
      expect(s.isSigningIn, isFalse);
    });

    test(
        'Play services / offline / misconfiguration produce messages and no request',
        () async {
      for (final (failure, expected) in [
        (GoogleAuthFailure.playServices, 'Google Play services'),
        (GoogleAuthFailure.noNetwork, 'connection'),
        (GoogleAuthFailure.notConfigured, 'set up correctly'),
        (GoogleAuthFailure.other, 'try again'),
      ]) {
        final google = FakeGoogleAuth()
          ..next = GoogleAuthResult.failed(failure);
        final s = newSession(google: google);
        final outcome = await s.signInWithGoogle();
        expect(outcome.error, contains(expected), reason: '$failure');
        expect(s.status, SessionStatus.signedOut);
      }
      expect(backend.requests, isEmpty);
    });

    test(
        'server 401 / 403 / offline / outage show the right text, leave no session, and sign Google out',
        () async {
      Future<SignInOutcome> attempt(
          http.Response Function(http.Request) handler,
          FakeGoogleAuth google) async {
        backend.on('POST /auth/google', handler);
        final s = newSession(google: google);
        final outcome = await s.signInWithGoogle();
        expect(s.status, SessionStatus.signedOut);
        expect(await CustomerApiService.getSavedToken(), isNull);
        return outcome;
      }

      var g = FakeGoogleAuth();
      var o = await attempt(
          (_) => reply(401,
              {'success': false, 'message': 'Google email is not verified'}),
          g);
      expect(o.error, 'Google email is not verified');
      expect(g.signOutCalls, 1,
          reason: 'so the next tap shows the account picker');

      g = FakeGoogleAuth();
      o = await attempt(
          (_) => reply(403, {
                'success': false,
                'message': 'This email belongs to a partner account'
              }),
          g);
      expect(o.error, 'This email belongs to a partner account');
      expect(g.signOutCalls, 1);

      g = FakeGoogleAuth();
      o = await attempt((_) => reply(401, {'success': false}), g);
      expect(o.error, contains('rejected'));

      g = FakeGoogleAuth();
      o = await attempt((_) => reply(403, {'success': false}), g);
      expect(o.error, contains('partner'));

      g = FakeGoogleAuth();
      o = await attempt((_) => throw http.ClientException('offline'), g);
      expect(o.error, contains('couldn\'t reach Grozo'));

      g = FakeGoogleAuth();
      o = await attempt((_) => reply(502, {'success': false}), g);
      expect(o.error, contains('unavailable'));
    });

    test('a second tap while signing in is ignored', () async {
      FakeServer(backend);
      final google = FakeGoogleAuth()..gate = Completer<void>();
      final s = newSession(google: google);
      final first = s.signInWithGoogle();
      expect(s.isSigningIn, isTrue);
      final second = await s.signInWithGoogle();
      expect(second.cancelled, isTrue);
      expect(google.signInCalls, 1);
      google.gate!.complete();
      expect((await first).success, isTrue);
      expect(s.isSigningIn, isFalse);
    });

    test(
        'logout, account deletion and session expiry all sign the Google account out',
        () async {
      FakeServer(backend, seed: userJson(), isNewUser: false);
      backend.on('DELETE /auth/account', (_) => reply(200, {'success': true}));

      var google = FakeGoogleAuth();
      var s = newSession(google: google);
      await s.signInWithGoogle();
      await s.logout();
      await pumpEventQueue();
      expect(s.status, SessionStatus.signedOut);
      expect(google.signOutCalls, 1);
      expect(backend.to('POST /auth/logout'), hasLength(1));

      google = FakeGoogleAuth();
      s = newSession(google: google);
      await s.signInWithGoogle();
      final del = await s.deleteAccount();
      expect(del.success, isTrue);
      expect(google.signOutCalls, 1);

      google = FakeGoogleAuth();
      s = newSession(google: google);
      await s.signInWithGoogle();
      s.expire();
      expect(google.signOutCalls, 1);
      expect(s.status, SessionStatus.signedOut);
    });

    test('a refused deletion keeps the Google account signed in', () async {
      FakeServer(backend, seed: userJson(), isNewUser: false);
      backend.on(
          'DELETE /auth/account',
          (_) =>
              reply(409, {'success': false, 'message': 'Order in progress'}));
      final google = FakeGoogleAuth();
      final s = newSession(google: google);
      await s.signInWithGoogle();
      final del = await s.deleteAccount();
      expect(del.conflict, isTrue);
      expect(google.signOutCalls, 0);
      expect(s.status, SessionStatus.signedIn);
    });

    test(
        'structured address selection is isolated to the signed-in account and cleared on logout',
        () async {
      FakeServer(backend,
          seed: userJson(isStudent: false, hostel: null), isNewUser: false);
      final s = newSession();
      await s.signInWithGoogle();
      expect(s.deliveryPoint, isNull);
      final a = DeliveryAddress({
        'id': 'address-a',
        'customerId': 'u1',
        'label': 'Home',
        'houseNumber': 'Flat 14',
        'street': 'Main Road',
        'locality': 'Central',
        'city': {'name': 'Bengaluru'},
        'pinCode': '560001'
      });
      s.selectDeliveryAddress(a);
      expect(s.deliveryPoint, 'Flat 14, Main Road, Central, Bengaluru 560001');
      expect(CustomerApiService.selectedAddressId, 'address-a');
      s.selectDeliveryAddress(DeliveryAddress(
          {...a.data, 'id': 'stolen', 'customerId': 'someone-else'}));
      expect(CustomerApiService.selectedAddressId, 'address-a');
      await s.logout();
      expect(s.deliveryPoint, isNull);
      expect(CustomerApiService.selectedAddressId, isNull);
    });
  });

  group('AuthScreen', () {
    testWidgets(
        'shows the welcome, one Google button and the privacy line without overflow',
        (tester) async {
      await pumpWithProviders(tester, const AuthScreen());
      expect(find.text('Continue with Google'), findsOneWidget);
      expect(find.byType(GoogleGMark), findsOneWidget);
      expect(find.textContaining('Fresh essentials'), findsOneWidget);
      expect(find.textContaining('Google name and email'), findsOneWidget);
      expect(find.textContaining('SMS'), findsNothing);
      expect(find.textContaining('password'), findsOneWidget,
          reason: 'the privacy line says there is no password');
      expect(tester.takeException(), isNull);
    });

    testWidgets('tap signs in through the Google layer and POSTs the ID token',
        (tester) async {
      FakeServer(backend);
      final google = FakeGoogleAuth();
      final session = newSession(google: google);
      await pumpWithProviders(tester, const AuthScreen(), session: session);
      await tester.tap(find.text('Continue with Google'));
      await settle(tester);
      expect(google.signInCalls, 1);
      expect(backend.bodyOf(backend.to('POST /auth/google').single),
          {'idToken': 'google-id-token'});
      expect(session.status, SessionStatus.needsProfile);
    });

    testWidgets(
        'cancel shows nothing; real failures show a message under the button',
        (tester) async {
      final google = FakeGoogleAuth()
        ..next = const GoogleAuthResult.failed(GoogleAuthFailure.cancelled);
      await pumpWithProviders(tester, const AuthScreen(),
          session: newSession(google: google));
      await tester.tap(find.text('Continue with Google'));
      await settle(tester);
      expect(find.byIcon(LucideIcons.circleAlert), findsNothing);
      expect(backend.requests, isEmpty);

      google.next =
          const GoogleAuthResult.failed(GoogleAuthFailure.playServices);
      await tester.tap(find.text('Continue with Google'));
      await settle(tester);
      expect(find.textContaining('Google Play services'), findsOneWidget);

      backend.on(
          'POST /auth/google',
          (_) => reply(
              403, {'success': false, 'message': 'This is a partner account'}));
      google.next =
          const GoogleAuthResult.success(GoogleCredential(idToken: 't'));
      await tester.tap(find.text('Continue with Google'));
      await settle(tester);
      expect(find.text('This is a partner account'), findsOneWidget);
      expect(find.textContaining('Google Play services'), findsNothing,
          reason: 'the old error is replaced');
      expect(tester.takeException(), isNull);
    });

    testWidgets('offline after picking an account explains the network problem',
        (tester) async {
      backend.on(
          'POST /auth/google', (_) => throw http.ClientException('offline'));
      await pumpWithProviders(tester, const AuthScreen());
      await tester.tap(find.text('Continue with Google'));
      await settle(tester);
      expect(find.textContaining('couldn\'t reach Grozo'), findsOneWidget);
    });

    testWidgets('shows progress while signing in and ignores repeat taps',
        (tester) async {
      FakeServer(backend);
      final google = FakeGoogleAuth()..gate = Completer<void>();
      await pumpWithProviders(tester, const AuthScreen(),
          session: newSession(google: google));
      await tester.tap(find.text('Continue with Google'));
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Continue with Google'), findsNothing);
      await tester.tap(find.byType(CircularProgressIndicator),
          warnIfMissed: false);
      await tester.pump();
      expect(google.signInCalls, 1);
      google.gate!.complete();
      await settle(tester);
    });
  });

  group('ProfileSetupScreen', () {
    SessionProvider needsProfileSession(
        {String? googleName = 'Aarav Sharma', Map<String, dynamic>? user}) {
      final s = SessionProvider(
          initial: SessionStatus.checking, googleAuth: FakeGoogleAuth());
      s.beginForTest(user ?? blankUserJson(),
          needsProfile: true, googleName: googleName, isNewAccount: true);
      return s;
    }

    Future<void> fillStep1(WidgetTester tester,
        {String name = 'Aarav Sharma', String phone = '9876543210'}) async {
      await tester.enterText(find.byKey(const ValueKey('name-field')), name);
      await tester.enterText(find.byKey(const ValueKey('phone-field')), phone);
      await tester.tap(find.text('Continue'));
      await settle(tester);
    }

    Future<void> pickAvatar(WidgetTester tester, int id) async {
      await tester.ensureVisible(kAvatarWithId(id));
      await tester.tap(kAvatarWithId(id));
      await tester.pump();
    }

    testWidgets(
        'name and phone are prefilled, with two steps and no campus classification',
        (tester) async {
      await pumpWithProviders(tester, const ProfileSetupScreen(),
          session: needsProfileSession(googleName: 'Meera Rao'));
      expect(find.text('Meera Rao'), findsOneWidget);
      expect(find.text('+91'), findsOneWidget);
      expect(find.bySemanticsLabel('Step 1 of 2'), findsOneWidget);
      expect(find.byKey(const ValueKey('student-yes')), findsNothing);
      expect(tester.takeException(), isNull);
    });
    testWidgets(
        'step 1 blocks empty, too-short, non-letter and non-Indian numbers with clear text',
        (tester) async {
      await pumpWithProviders(tester, const ProfileSetupScreen(),
          session: needsProfileSession(googleName: null));
      await tester.tap(find.text('Continue'));
      await settle(tester);
      expect(find.textContaining('Tell us your name'), findsOneWidget);
      expect(find.text('Enter your 10-digit Indian mobile number.'),
          findsOneWidget);

      await tester.enterText(find.byKey(const ValueKey('name-field')), 'A');
      await tester.enterText(
          find.byKey(const ValueKey('phone-field')), '5876543210');
      await tester.pump();
      expect(find.textContaining('Tell us your name'), findsNothing,
          reason: 'typing clears the error');
      await tester.tap(find.text('Continue'));
      await settle(tester);
      expect(find.textContaining('at least 2'), findsOneWidget);
      expect(find.textContaining('start with 6, 7, 8 or 9'), findsOneWidget);

      await tester.enterText(
          find.byKey(const ValueKey('name-field')), 'Aarav <b>');
      await tester.enterText(
          find.byKey(const ValueKey('phone-field')), '98765');
      await tester.tap(find.text('Continue'));
      await settle(tester);
      expect(find.textContaining('Use letters'), findsOneWidget);
      expect(find.text('Enter your 10-digit Indian mobile number.'),
          findsOneWidget);

      expect(find.text('Are you a\nstudent?'), findsNothing,
          reason: 'still on step 1');
      expect(backend.requests, isEmpty);
      expect(tester.takeException(), isNull);
    });

    testWidgets('pasting +91 98765 43210 keeps the ten digits', (tester) async {
      await pumpWithProviders(tester, const ProfileSetupScreen(),
          session: needsProfileSession());
      await tester.enterText(
          find.byKey(const ValueKey('phone-field')), '+91 98765 43210');
      await tester.pump();
      expect(
          tester
              .widget<TextField>(find.byKey(const ValueKey('phone-field')))
              .controller!
              .text,
          '9876543210');
    });

    testWidgets(
        'the second step requires an explicit avatar and never asks for a hostel',
        (tester) async {
      await pumpWithProviders(tester, const ProfileSetupScreen(),
          session: needsProfileSession());
      await fillStep1(tester);
      expect(find.bySemanticsLabel('Step 2 of 2'), findsOneWidget);
      expect(
          tester.widget<KAvatarPicker>(find.byType(KAvatarPicker)).selectedId,
          isNull);
      expect(isDisabled(tester, 'Finish'), isTrue);
      expect(find.byKey(const ValueKey('hostel-field')), findsNothing);
      await pickAvatar(tester, 6);
      expect(isDisabled(tester, 'Finish'), isFalse);
    });
    testWidgets('back and forward preserve the name, phone and selected avatar',
        (tester) async {
      await pumpWithProviders(tester, const ProfileSetupScreen(),
          session: needsProfileSession());
      await fillStep1(tester, name: 'Meera Rao', phone: '9123456780');
      await pickAvatar(tester, 4);
      await tester.tap(find.byIcon(LucideIcons.arrowLeft));
      await settle(tester);
      expect(find.text('Meera Rao'), findsOneWidget);
      expect(find.text('9123456780'), findsOneWidget);
      await tester.tap(find.text('Continue'));
      await settle(tester);
      expect(
          tester.widget<KAvatarPicker>(find.byType(KAvatarPicker)).selectedId,
          4);
      expect(backend.to('PUT /auth/profile'), isEmpty);
    });
    testWidgets(
        'one authenticated save sends only name, phone and avatar and enters the app',
        (tester) async {
      await CustomerApiService.saveToken('jwt-setup');
      final server = FakeServer(backend);
      final session = needsProfileSession();
      await pumpWithProviders(tester, const ProfileSetupScreen(),
          session: session);
      await fillStep1(tester,
          name: '  Aarav   Sharma ', phone: '+91 98765 43210');
      await pickAvatar(tester, 9);
      await tester.tap(find.text('Finish'));
      await settle(tester);
      final put = backend.to('PUT /auth/profile').single;
      expect(backend.bodyOf(put),
          {'name': 'Aarav Sharma', 'phone': '9876543210', 'avatarId': 9});
      expect(put.headers['Authorization'], 'Bearer jwt-setup');
      expect(server.putBodies, hasLength(1));
      expect(session.status, SessionStatus.signedIn);
      expect(session.user?.avatarId, 9);
      expect(session.deliveryPoint, isNull,
          reason: 'delivery addresses are selected separately');
    });
    testWidgets(
        'a customer with an old student flag has the same general profile flow',
        (tester) async {
      FakeServer(backend, seed: userJson(avatarId: null));
      final session = needsProfileSession(user: userJson(avatarId: null));
      await pumpWithProviders(tester, const ProfileSetupScreen(),
          session: session);
      await fillStep1(tester);
      await pickAvatar(tester, 2);
      await tester.tap(find.text('Finish'));
      await settle(tester);
      expect(backend.bodyOf(backend.to('PUT /auth/profile').single).keys,
          containsAll(['name', 'phone', 'avatarId']));
      expect(
          backend
              .bodyOf(backend.to('PUT /auth/profile').single)
              .containsKey('hostelBlock'),
          isFalse);
    });
    testWidgets(
        'a server phone validation error returns to the field and preserves the avatar',
        (tester) async {
      FakeServer(backend);
      backend.on(
          'PUT /auth/profile',
          (_) => reply(400, {
                'success': false,
                'field': 'phone',
                'message': 'This phone is already in use.'
              }));
      await pumpWithProviders(tester, const ProfileSetupScreen(),
          session: needsProfileSession());
      await fillStep1(tester);
      await pickAvatar(tester, 7);
      await tester.tap(find.text('Finish'));
      await settle(tester);
      await settle(tester);
      await tester.ensureVisible(find.byKey(const ValueKey('phone-field')));
      await settle(tester);
      expect(find.text('This phone is already in use.'), findsOneWidget);
      expect(find.byKey(const ValueKey('phone-field')), findsOneWidget);
      await tester.tap(find.text('Continue'));
      await settle(tester);
      expect(
          tester.widget<KAvatarPicker>(find.byType(KAvatarPicker)).selectedId,
          7);
    });
    testWidgets(
        'a network failure on Finish preserves data and allows a real retry',
        (tester) async {
      final server = FakeServer(backend);
      backend.on(
          'PUT /auth/profile', (_) => throw const SocketException('offline'));
      final session = needsProfileSession();
      await pumpWithProviders(tester, const ProfileSetupScreen(),
          session: session);
      await fillStep1(tester);
      await pickAvatar(tester, 3);
      await tester.tap(find.text('Finish'));
      await settle(tester);
      expect(session.status, SessionStatus.needsProfile);
      expect(isDisabled(tester, 'Finish'), isFalse);
      backend.on('PUT /auth/profile', (r) {
        final body = backend.bodyOf(r);
        return reply(200, {
          'success': true,
          'user': {...server.user, ...body},
          'needsProfile': false
        });
      });
      await tester.tap(find.text('Finish'));
      await settle(tester);
      expect(session.status, SessionStatus.signedIn);
    });
    testWidgets(
        'a partially completed profile restores its saved details without a student question',
        (tester) async {
      final session = needsProfileSession(
          googleName: null,
          user: userJson(
              name: 'Meera Rao', phone: '+91 9123456780', avatarId: 8));
      await pumpWithProviders(tester, const ProfileSetupScreen(),
          session: session);
      expect(find.text('Meera Rao'), findsOneWidget);
      expect(find.text('9123456780'), findsOneWidget);
      await tester.tap(find.text('Continue'));
      await settle(tester);
      expect(
          tester.widget<KAvatarPicker>(find.byType(KAvatarPicker)).selectedId,
          8);
      expect(isDisabled(tester, 'Finish'), isFalse);
    });
    for (final scale in [1.3, 2.0]) {
      testWidgets('both profile steps fit 360x640 at text scale $scale',
          (tester) async {
        await pumpWithProviders(tester, const ProfileSetupScreen(),
            session: needsProfileSession(), textScale: scale);
        expect(tester.takeException(), isNull);
        await fillStep1(tester);
        expect(tester.takeException(), isNull);
        await pickAvatar(tester, 1);
        expect(isDisabled(tester, 'Finish'), isFalse);
      });
    }
  });

  group('ProfileScreen', () {
    SessionProvider signedIn(
        {Map<String, dynamic>? user, FakeGoogleAuth? google}) {
      final s = SessionProvider(
          initial: SessionStatus.checking,
          googleAuth: google ?? FakeGoogleAuth());
      s.beginForTest(user ?? userJson());
      return s;
    }

    Future<void> openDeleteSheet(WidgetTester tester) async {
      await tapScrolled(tester, find.text('Delete account'));
    }

    testWidgets(
        'shows avatar, name, e-mail, masked phone, student status, hostel, coins and version',
        (tester) async {
      final cart = CartProvider()..setKraveoCoins(120);
      await pumpWithProviders(tester, const ProfileScreen(),
          session: signedIn(), cart: cart);
      await tester.pump(const Duration(seconds: 1));
      expect(find.text('Me'), findsOneWidget);
      expect(kAvatarWithId(3), findsOneWidget);
      expect(find.text('Aarav Sharma'), findsWidgets);
      expect(find.text('aarav@example.com'), findsWidgets);
      expect(find.text('+91 98••• ••210'), findsOneWidget);
      expect(find.text('9876543210'), findsNothing);
      expect(find.textContaining('Grozo Coins'), findsNothing);
      expect(find.text('120'), findsNothing);
      expect(find.text('Delivery addresses'), findsOneWidget);
      expect(find.text('Add or select an address'), findsOneWidget);
      expect(find.text('I\'m a customer'), findsNothing);
      await tester.scrollUntilVisible(find.text('Grozo v$kAppVersion'), 200,
          scrollable: find.byType(Scrollable).first);
      expect(find.text('Grozo v$kAppVersion'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets(
        'a non-student sees "chosen at checkout" instead of a hostel row; a missing phone invites adding one',
        (tester) async {
      final session =
          signedIn(user: userJson(isStudent: false, hostel: null, phone: null));
      await pumpWithProviders(tester, const ProfileScreen(), session: session);
      await tester.pump(const Duration(seconds: 1));
      expect(find.text('Add or select an address'), findsOneWidget);
      expect(find.text('Address block'), findsNothing);
      expect(find.text('Add your number'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets(
        'orders summary counts delivered orders, or explains there are none',
        (tester) async {
      final orders = OrderProvider()..resetForLogout();
      await pumpWithProviders(tester, const ProfileScreen(),
          session: signedIn(), orders: orders);
      await tester.scrollUntilVisible(
          find.textContaining('No delivered orders yet'), 150,
          scrollable: find.byType(Scrollable).first);
      expect(find.textContaining('No delivered orders yet'), findsOneWidget);
    });

    testWidgets(
        'changing the avatar: Save is off until a different one is picked, then PUTs avatarId',
        (tester) async {
      await CustomerApiService.saveToken('jwt-me');
      final server = FakeServer(backend, seed: userJson());
      final session = signedIn();
      await pumpWithProviders(tester, const ProfileScreen(), session: session);

      await tester.tap(find.byWidgetPredicate(
          (w) => w is KPressable && w.semanticLabel == 'Change avatar'));
      await settle(tester);
      expect(find.text('Choose your avatar'), findsOneWidget);
      expect(isDisabled(tester, 'Save'), isTrue, reason: 'unchanged');
      expect(
          tester.widget<KAvatarPicker>(find.byType(KAvatarPicker)).selectedId,
          3);

      await tester.ensureVisible(kAvatarWithId(12).last);
      await tester.tap(kAvatarWithId(12).last);
      await tester.pump();
      expect(isDisabled(tester, 'Save'), isFalse);
      await tester.tap(find.text('Save'));
      await settle(tester);

      expect(server.putBodies.single, {'avatarId': 12});
      expect(find.text('Choose your avatar'), findsNothing);
      expect(session.user?.avatarId, 12);
      expect(kAvatarWithId(12), findsWidgets);
    });

    testWidgets('a failed avatar save keeps the sheet open with the reason',
        (tester) async {
      backend.on(
          'PUT /auth/profile',
          (_) => reply(400, {
                'success': false,
                'message': 'Pick an avatar from the list',
                'field': 'avatarId'
              }));
      final session = signedIn();
      await pumpWithProviders(tester, const ProfileScreen(), session: session);
      await tester.tap(find.byWidgetPredicate(
          (w) => w is KPressable && w.semanticLabel == 'Change avatar'));
      await settle(tester);
      await tester.ensureVisible(kAvatarWithId(5).last);
      await tester.tap(kAvatarWithId(5).last);
      await tester.pump();
      await tester.tap(find.text('Save'));
      await settle(tester);
      expect(find.text('Pick an avatar from the list'), findsOneWidget);
      expect(find.text('Choose your avatar'), findsOneWidget);
      expect(session.user?.avatarId, 3);
    });

    testWidgets(
        'editing the mobile number validates, then sends only the phone',
        (tester) async {
      await CustomerApiService.saveToken('jwt-me');
      final server = FakeServer(backend, seed: userJson());
      final session = signedIn();
      await pumpWithProviders(tester, const ProfileScreen(), session: session);

      await tapScrolled(tester, find.text('+91 98••• ••210'));
      expect(find.text('Your details'), findsOneWidget);
      expect(isDisabled(tester, 'Save'), isTrue);

      await tester.enterText(
          find.byKey(const ValueKey('edit-phone-field')), '5876543210');
      await tester.pump();
      await tester.tap(find.text('Save'));
      await settle(tester);
      expect(find.textContaining('start with 6, 7, 8 or 9'), findsOneWidget);
      expect(server.putBodies, isEmpty);

      await tester.enterText(
          find.byKey(const ValueKey('edit-phone-field')), '9123456780');
      await tester.pump();
      await tester.tap(find.text('Save'));
      await settle(tester);
      expect(server.putBodies.single, {'phone': '9123456780'});
      expect(find.text('Your details'), findsNothing);
      expect(session.user?.phone, '+91 9123456780');
      expect(find.text('+91 91••• ••780'), findsOneWidget);
    });

    testWidgets(
        'editing the name shows the server\'s field error under the name',
        (tester) async {
      backend.on(
          'PUT /auth/profile',
          (_) => reply(400, {
                'success': false,
                'message': 'That name isn\'t allowed',
                'field': 'name'
              }));
      await pumpWithProviders(tester, const ProfileScreen(),
          session: signedIn());
      await tapScrolled(tester, find.text('Name'));
      await tester.enterText(
          find.byKey(const ValueKey('edit-name-field')), 'Aarav K');
      await tester.pump();
      await tester.tap(find.text('Save'));
      await settle(tester);
      expect(find.text('That name isn\'t allowed'), findsOneWidget);
      expect(find.text('Your details'), findsOneWidget);
    });

    testWidgets(
        'opens saved structured addresses without a student-only switch',
        (tester) async {
      FakeServer(backend, seed: userJson());
      backend.on(
          'GET /v1/addresses',
          (_) => reply(200, {
                'success': true,
                'data': [addressJson()],
                'nextCursor': null
              }));
      await pumpWithProviders(tester, const ProfileScreen(),
          session: signedIn());
      await tapScrolled(tester, find.text('Delivery addresses'));
      expect(find.byType(AddressesScreen), findsOneWidget);
      expect(find.text('Home · Selected'), findsOneWidget);
      expect(
          find.textContaining('Flat 14, Main Road, Central, Bengaluru 560001'),
          findsOneWidget);
      expect(find.text('Address block'), findsNothing);
    });
    testWidgets(
        'selecting another saved address persists its default and updates the session',
        (tester) async {
      FakeServer(backend, seed: userJson());
      final work = addressJson(
          id: 'address-work',
          label: 'Work',
          house: 'Office 9',
          selected: false);
      backend.on(
          'GET /v1/addresses',
          (_) => reply(200, {
                'success': true,
                'data': [addressJson(), work],
                'nextCursor': null
              }));
      backend.on(
          'PUT /v1/addresses/address-work',
          (r) => reply(200, {
                'success': true,
                'data': {...work, ...backend.bodyOf(r)}
              }));
      final session = signedIn();
      await pumpWithProviders(tester, const ProfileScreen(), session: session);
      await tapScrolled(tester, find.text('Delivery addresses'));
      await tester.tap(find.text('Work'));
      await settle(tester);
      final write =
          backend.bodyOf(backend.to('PUT /v1/addresses/address-work').single);
      expect(write['isDefault'], true);
      expect(write['cityId'], 'blr');
      expect(session.selectedAddress?.id, 'address-work');
      expect(session.deliveryPoint, contains('Office 9'));
      expect(backend.to('PUT /auth/profile'), isEmpty);
    });
    testWidgets(
        'closing the picker leaves the current saved address selected and sends no writes',
        (tester) async {
      FakeServer(backend, seed: userJson());
      backend.on(
          'GET /v1/addresses',
          (_) => reply(200, {
                'success': true,
                'data': [addressJson()],
                'nextCursor': null
              }));
      final session = signedIn();
      await pumpWithProviders(tester, const ProfileScreen(), session: session);
      await tapScrolled(tester, find.text('Delivery addresses'));
      await tester.pageBack();
      await settle(tester);
      expect(session.selectedAddress?.id, 'address-home');
      expect(backend.requests.where((r) => r.method == 'PUT'), isEmpty);
    });
    testWidgets(
        'deletion requires confirmation and then chooses the server’s remaining default',
        (tester) async {
      FakeServer(backend, seed: userJson());
      var rows = [addressJson()];
      backend.on(
          'GET /v1/addresses',
          (_) =>
              reply(200, {'success': true, 'data': rows, 'nextCursor': null}));
      backend.on('DELETE /v1/addresses/address-home', (_) {
        rows = [];
        return reply(200, {
          'success': true,
          'data': {'deleted': true}
        });
      });
      final session = signedIn();
      await pumpWithProviders(tester, const ProfileScreen(), session: session);
      await tapScrolled(tester, find.text('Delivery addresses'));
      await tester.tap(find.text('Delete'));
      await settle(tester);
      expect(backend.to('DELETE /v1/addresses/address-home'), isEmpty);
      await tester.tap(find.widgetWithText(TextButton, 'Delete').last);
      await settle(tester);
      expect(backend.to('DELETE /v1/addresses/address-home'), hasLength(1));
      await tester.pageBack();
      await settle(tester);
      expect(session.deliveryPoint, isNull);
    });
    testWidgets(
        'a refused address save keeps the old selection and the picker explains why',
        (tester) async {
      FakeServer(backend, seed: userJson());
      final work =
          addressJson(id: 'address-work', label: 'Work', selected: false);
      backend.on(
          'GET /v1/addresses',
          (_) => reply(200, {
                'success': true,
                'data': [addressJson(), work],
                'nextCursor': null
              }));
      backend.on(
          'PUT /v1/addresses/address-work',
          (_) => reply(500, {
                'success': false,
                'message': 'Address service busy. Try again.'
              }));
      final session = signedIn();
      await pumpWithProviders(tester, const ProfileScreen(), session: session);
      await tapScrolled(tester, find.text('Delivery addresses'));
      await tester.tap(find.text('Work'));
      await settle(tester);
      expect(find.textContaining('Address service busy'), findsOneWidget);
      expect(session.selectedAddress?.id, 'address-home');
      expect(find.byType(AddressesScreen), findsOneWidget);
    });
    testWidgets(
        'a 401 while selecting an address clears the token and expires the session',
        (tester) async {
      await CustomerApiService.saveToken('jwt-address');
      FakeServer(backend, seed: userJson());
      backend.on(
          'GET /v1/addresses',
          (_) => reply(200, {
                'success': true,
                'data': [addressJson()],
                'nextCursor': null
              }));
      backend.on('PUT /v1/addresses/address-home',
          (_) => reply(401, {'success': false, 'message': 'Session expired'}));
      final session = signedIn();
      CustomerApiService.onUnauthorized = session.expire;
      await pumpWithProviders(tester, const ProfileScreen(), session: session);
      await tapScrolled(tester, find.text('Delivery addresses'));
      await tester.tap(find.text('Home · Selected'));
      await settle(tester);
      expect(await CustomerApiService.getSavedToken(), isNull);
      expect(session.status, SessionStatus.signedOut);
      CustomerApiService.onUnauthorized = null;
    });

    testWidgets(
        'log out asks first, notifies the backend, ends the session and signs Google out',
        (tester) async {
      await CustomerApiService.saveToken('jwt-out');
      backend.on('POST /auth/logout', (_) => reply(200, {'success': true}));
      final google = FakeGoogleAuth();
      final session = signedIn(google: google);
      var signedOutCalls = 0;
      session.onSignedOut = () => signedOutCalls++;
      await pumpWithProviders(tester, const ProfileScreen(), session: session);

      await tapScrolled(tester, find.text('Log out'));
      expect(find.text('Log out of Grozo?'), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await settle(tester);
      expect(session.status, SessionStatus.signedIn);
      expect(google.signOutCalls, 0);

      await tester.tap(find.text('Log out'));
      await settle(tester);
      await tester.tap(find.descendant(
          of: find.byType(KButton), matching: find.text('Log out')));
      await settle(tester);

      expect(session.status, SessionStatus.signedOut);
      expect(signedOutCalls, 1);
      expect(google.signOutCalls, 1);
      expect(await CustomerApiService.getSavedToken(), isNull);
      expect(backend.to('POST /auth/logout').single.headers['Authorization'],
          'Bearer jwt-out');
    });

    testWidgets('log out still works when the backend is unreachable',
        (tester) async {
      await CustomerApiService.saveToken('jwt-out');
      backend.on(
          'POST /auth/logout', (_) => throw http.ClientException('offline'));
      final session = signedIn();
      await pumpWithProviders(tester, const ProfileScreen(), session: session);
      await tapScrolled(tester, find.text('Log out'));
      await tester.tap(find.descendant(
          of: find.byType(KButton), matching: find.text('Log out')));
      await settle(tester);
      expect(session.status, SessionStatus.signedOut);
      expect(await CustomerApiService.getSavedToken(), isNull);
    });

    testWidgets(
        'delete needs an explicit acknowledgement and shows the 409 reason inline',
        (tester) async {
      await CustomerApiService.saveToken('jwt-del');
      backend.on(
          'DELETE /auth/account',
          (_) => reply(409,
              {'success': false, 'message': 'You have an order in progress'}));
      final session = signedIn();
      await pumpWithProviders(tester, const ProfileScreen(), session: session);
      await openDeleteSheet(tester);

      expect(find.text('Delete your account?'), findsOneWidget);
      expect(find.textContaining('permanent'), findsWidgets);
      await tester.tap(find.text('Delete'));
      await settle(tester);
      expect(backend.to('DELETE /auth/account'), isEmpty,
          reason: 'disabled until acknowledged');

      await tester.tap(find.text('I understand this is permanent'));
      await settle(tester);
      await tester.tap(find.text('Delete'));
      await settle(tester);
      expect(find.text('You have an order in progress'), findsOneWidget);
      expect(find.text('Delete your account?'), findsOneWidget,
          reason: 'sheet stays open');
      expect(session.status, SessionStatus.signedIn);
      expect(await CustomerApiService.getSavedToken(), 'jwt-del');
    });

    testWidgets(
        'confirmed deletion signs out, clears the token and signs Google out',
        (tester) async {
      await CustomerApiService.saveToken('jwt-del');
      backend.on('DELETE /auth/account', (_) => reply(200, {'success': true}));
      final google = FakeGoogleAuth();
      final session = signedIn(google: google);
      await pumpWithProviders(tester, const ProfileScreen(), session: session);
      await openDeleteSheet(tester);
      await tester.tap(find.text('I understand this is permanent'));
      await settle(tester);
      await tester.tap(find.text('Delete'));
      await settle(tester);

      expect(backend.to('DELETE /auth/account').single.headers['Authorization'],
          'Bearer jwt-del');
      expect(session.status, SessionStatus.signedOut);
      expect(google.signOutCalls, 1);
      expect(await CustomerApiService.getSavedToken(), isNull);
      expect(find.text('Delete your account?'), findsNothing);
      expect(find.text('Your account has been deleted.'), findsOneWidget);
    });
  });

  group('Checkout drop-off', () {
    setUp(() {
      // Razorpay() talks to a native plugin as soon as it is created.
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
              const MethodChannel('razorpay_flutter'), (call) async => null);
    });
    tearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
              const MethodChannel('razorpay_flutter'), null);
    });

    CartProvider cartWithItem() {
      final cart = CartProvider();
      cart.addItem(
        item: const MenuItemModel(
            id: 'a',
            vendorId: 'ven-1',
            name: 'Test dish',
            price: 120,
            category: 'Thalis',
            description: 'd',
            imageUrl: '',
            isAvailable: true),
        dhabaId: 'ven-1',
        dhabaName: 'Sharma Highway Dhaba',
      );
      return cart;
    }

    testWidgets(
        'checkout with no saved address opens address selection before any payment',
        (tester) async {
      FakeServer(backend, seed: userJson());
      final session = SessionProvider(
          initial: SessionStatus.checking, googleAuth: FakeGoogleAuth())
        ..beginForTest(userJson());
      await pumpWithProviders(
          tester, const CheckoutScreen(selectedHostel: null),
          session: session, cart: cartWithItem());
      final choose = find
          .bySemanticsLabel('Choose a saved delivery address before checkout');
      expect(choose, findsOneWidget);
      await tester.tap(choose);
      await settle(tester);
      expect(find.byType(AddressesScreen), findsOneWidget);
      expect(find.text('Add address'), findsOneWidget);
      expect(backend.to('POST /v2/checkout'), isEmpty);
      expect(tester.takeException(), isNull);
    });
    testWidgets(
        'a selected structured address is shown in checkout and permits price confirmation',
        (tester) async {
      FakeServer(backend, seed: userJson());
      backend.on(
          'GET /v1/addresses',
          (_) => reply(200, {
                'success': true,
                'data': [addressJson()],
                'nextCursor': null
              }));
      final session = SessionProvider(
          initial: SessionStatus.checking, googleAuth: FakeGoogleAuth())
        ..beginForTest(userJson());
      session.selectDeliveryAddress(DeliveryAddress(addressJson()));
      await pumpWithProviders(
          tester, CheckoutScreen(selectedHostel: session.deliveryPoint),
          session: session, cart: cartWithItem());
      expect(
          find.textContaining('Flat 14, Main Road, Central, Bengaluru 560001'),
          findsWidgets);
      expect(find.textContaining('Pay ₹'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('AuthGate (whole app)', () {
    Future<void> launch(WidgetTester tester, {FakeGoogleAuth? google}) async {
      smallPhone(tester);
      await tester.pumpWidget(
          KraveoCustomerApp(googleAuth: google ?? FakeGoogleAuth()));
      await tester.pump(const Duration(milliseconds: 200));
      await tester.pump(const Duration(seconds: 1));
    }

    testWidgets('no saved session goes straight to the Google welcome',
        (tester) async {
      await launch(tester);
      expect(find.text('Continue with Google'), findsOneWidget);
      expect(backend.requests, isEmpty);
    });

    testWidgets(
        'brand-new student: Google -> name/phone and avatar -> Home with address selection',
        (tester) async {
      final server = FakeServer(backend);
      final google = FakeGoogleAuth();
      await launch(tester, google: google);

      await tester.tap(find.text('Continue with Google'));
      await settle(tester);
      expect(find.text('Aarav Sharma'), findsOneWidget,
          reason: 'name pre-filled from Google');

      await tester.enterText(
          find.byKey(const ValueKey('phone-field')), '9876543210');
      await tester.tap(find.text('Continue'));
      await settle(tester);
      await tester.ensureVisible(kAvatarWithId(5));
      await tester.tap(kAvatarWithId(5));
      await tester.pump();
      await tester.tap(find.text('Finish'));
      await tester.pump(const Duration(milliseconds: 200));
      await tester.pump(const Duration(seconds: 5));

      expect(server.putBodies, hasLength(1));
      expect(find.text('DELIVERING TO'), findsOneWidget);
      expect(find.text('Choose delivery address'), findsWidgets);
      expect(kAvatarWithId(5), findsWidgets,
          reason: 'greeting shows the chosen avatar');
      expect(google.signInCalls, 1);
    });

    testWidgets(
        'returning student skips sign-up; logout resets user state and signs Google out',
        (tester) async {
      FakeServer(backend, seed: userJson(hostel: 'Block 3'), isNewUser: false);
      final google = FakeGoogleAuth();
      await launch(tester, google: google);
      await tester.tap(find.text('Continue with Google'));
      await tester.pump(const Duration(milliseconds: 200));
      await tester.pump(const Duration(seconds: 5));

      expect(find.text('DELIVERING TO'), findsOneWidget);
      expect(find.text('Choose delivery address'), findsWidgets);
      expect(find.textContaining(', AARAV'), findsOneWidget);
      final ctx = tester.element(find.byType(Scaffold).first);
      expect(ctx.read<CartProvider>().userKraveoCoins, 120,
          reason: 'seeded from the backend');

      await tester.tap(find.byIcon(LucideIcons.user).last);
      await settle(tester);
      expect(find.text('aarav@example.com'), findsWidgets);

      await tester.scrollUntilVisible(find.text('Log out'), 150,
          scrollable: find.byType(Scrollable).last);
      await tester.ensureVisible(find.text('Log out'));
      await tester.pump();
      await tester.tap(find.text('Log out'));
      await settle(tester);
      await tester.tap(find.descendant(
          of: find.byType(KButton), matching: find.text('Log out')));
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(seconds: 1));

      expect(find.text('Continue with Google'), findsOneWidget);
      final auth = tester.element(find.byType(AuthScreen));
      expect(auth.read<CartProvider>().userKraveoCoins, 0);
      expect(auth.read<OrderProvider>().orderHistory, isEmpty);
      expect(auth.read<OrderProvider>().activeOrder, isNull);
      expect(await CustomerApiService.getSavedToken(), isNull);
      expect(backend.to('POST /auth/logout'), hasLength(1));
      expect(google.signOutCalls, 1);
    });

    testWidgets(
        'a non-student sees "Delivery point" on Home until they choose one at checkout',
        (tester) async {
      SharedPreferences.setMockInitialValues(
          {'kraveo_customer_jwt_token': 'jwt-live'});
      FakeServer(backend,
          seed: userJson(isStudent: false, hostel: null), isNewUser: false);
      await launch(tester);
      await tester.pump(const Duration(seconds: 5));
      expect(find.text('Choose delivery address'), findsOneWidget);
      expect(find.text('DELIVERING TO'), findsOneWidget);
    });

    testWidgets('a session that still needs a profile lands on sign-up step 1',
        (tester) async {
      SharedPreferences.setMockInitialValues(
          {'kraveo_customer_jwt_token': 'jwt-live'});
      FakeServer(backend,
          seed: userJson(
              name: 'Aarav Sharma',
              phone: null,
              hostel: null,
              isStudent: null,
              avatarId: null));
      await launch(tester);
      expect(find.text('Welcome to\nKraveo'), findsOneWidget);
      expect(find.text('Aarav Sharma'), findsOneWidget);
    });

    testWidgets(
        'an expired saved token returns to the welcome with the session-expired snackbar',
        (tester) async {
      SharedPreferences.setMockInitialValues(
          {'kraveo_customer_jwt_token': 'jwt-old'});
      backend.on('GET /auth/profile', (_) => reply(401, {'success': false}));
      await launch(tester);
      expect(find.text('Continue with Google'), findsOneWidget);
      expect(find.text('Session expired, please log in again'), findsOneWidget);
      expect(await CustomerApiService.getSavedToken(), isNull);
    });

    testWidgets(
        'HTTP 401 in the middle of a session closes pushed screens and shows the welcome',
        (tester) async {
      SharedPreferences.setMockInitialValues(
          {'kraveo_customer_jwt_token': 'jwt-live'});
      FakeServer(backend, seed: userJson(hostel: 'Block 3'), isNewUser: false);
      backend.on('POST /v2/checkout',
          (_) => reply(401, {'success': false, 'message': 'jwt expired'}));
      final google = FakeGoogleAuth();
      await launch(tester, google: google);
      await tester.pump(const Duration(seconds: 5));
      expect(find.text('DELIVERING TO'), findsOneWidget);

      OrderResult<Object?>? result;
      await tester.runAsync(() async {
        result = await const HttpOrderApi().createOrder(
            const CreateOrderRequest(
                vendorId: 'v1',
                items: [],
                dropoffHostel: 'Block 3',
                dropoffNotes: '',
                clientRequestId: 'k2'));
      });
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(seconds: 1));

      expect(result?.error?.kind, OrderErrorKind.unauthorized);
      expect(find.text('Continue with Google'), findsOneWidget);
      expect(find.text('Session expired, please log in again'), findsOneWidget);
      expect(await CustomerApiService.getSavedToken(), isNull);
      expect(google.signOutCalls, 1);
    });

    testWidgets('a 401 during the last sign-up save returns to the welcome',
        (tester) async {
      SharedPreferences.setMockInitialValues(
          {'kraveo_customer_jwt_token': 'jwt-live'});
      FakeServer(backend);
      backend.on('PUT /auth/profile', (_) => reply(401, {'success': false}));
      await launch(tester);
      await tester.enterText(
          find.byKey(const ValueKey('name-field')), 'Aarav Sharma');
      await tester.enterText(
          find.byKey(const ValueKey('phone-field')), '9876543210');
      await tester.tap(find.text('Continue'));
      await settle(tester);
      await tester.ensureVisible(kAvatarWithId(1));
      await tester.tap(kAvatarWithId(1));
      await tester.pump();
      await tester.tap(find.text('Finish'));
      await tester.pump(const Duration(milliseconds: 200));
      await tester.pump(const Duration(seconds: 1));
      expect(find.text('Continue with Google'), findsOneWidget);
      expect(find.text('Session expired, please log in again'), findsOneWidget);
    });

    testWidgets(
        'unreachable backend keeps the session and offers a retry or another account',
        (tester) async {
      SharedPreferences.setMockInitialValues(
          {'kraveo_customer_jwt_token': 'jwt-live'});
      var online = false;
      backend.on(
          'GET /auth/profile',
          (_) => online
              ? reply(200,
                  {'success': true, 'user': userJson(), 'needsProfile': false})
              : throw http.ClientException('offline'));
      backend.on(
          'GET /v1/vendors/nearby', (_) => reply(500, {'success': false}));
      await launch(tester);
      expect(find.text('Can\'t reach Grozo'), findsOneWidget);
      expect(find.text('Use a different account'), findsOneWidget);
      expect(await CustomerApiService.getSavedToken(), 'jwt-live');

      online = true;
      await tester.tap(find.text('Try again'));
      await tester.pump(const Duration(milliseconds: 200));
      await tester.pump(const Duration(seconds: 6));
      expect(find.text('DELIVERING TO'), findsOneWidget);
    });
  });
}
