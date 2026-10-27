// Synthetic native SDK/HTTP fixtures, never a hosted Clerk or personal-account test.
import 'dart:async';
import 'dart:convert';
import 'package:customer_app/providers/session_provider.dart';
import 'package:customer_app/screens/auth_screen.dart';
import 'package:customer_app/services/customer_api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('in.grozo/clerk');
  const events = MethodChannel('in.grozo/clerk/events');
  final calls = <String>[];
  var sdkToken = 'synthetic-native-session';
  var subject = 'SyntheticA';
  late SessionProvider session;
  Map<String, Object> native() => {
        'ready': true,
        'signedIn': true,
        'userId': 'user_$subject',
        'sessionId': 'sess_$subject',
        'email': 'synthetic@example.invalid',
      };
  http.Response response(String role,
          {int status = 200, bool needsProfile = false}) =>
      http.Response(
          jsonEncode({
            'success': status == 200,
            'needsProfile': needsProfile,
            if (status == 200)
              'user': {
                'id': 'internal-$subject',
                'name': 'Synthetic customer',
                'role': role,
                'isStudent': false,
                'avatarId': 1
              },
          }),
          status,
          headers: {'content-type': 'application/json'});
  setUp(() async {
    expect(GrozoAuthConfig.usesClerk, isTrue,
        reason:
            'Run this dedicated suite with --dart-define=AUTH_MODE=clerk-test');
    calls.clear();
    sdkToken = 'synthetic-native-session';
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(events, (_) async => null);
    messenger.setMockMethodCallHandler(channel, (call) async {
      calls.add(call.method);
      if (call.method == 'getToken') return sdkToken.isEmpty ? null : sdkToken;
      if (call.method == 'setActiveSession') {
        subject = call.arguments['sessionId'];
      }
      return native();
    });
    CustomerApiService.onUnauthorized = null;
    await CustomerApiService.clearToken();
    session = SessionProvider(initial: SessionStatus.signedOut);
    CustomerApiService.httpClientOverride = MockClient((request) async =>
        request.url.path.endsWith('/auth/profile')
            ? response('STUDENT')
            : http.Response('{"success":true,"data":[]}', 200));
  });
  tearDown(() async {
    session.dispose();
    CustomerApiService.onUnauthorized = null;
    CustomerApiService.httpClientOverride = null;
  });
  test(
      'native initialization precedes profile validation; customer opens with one SDK token request',
      () async {
    CustomerApiService.httpClientOverride = MockClient((request) async {
      if (request.url.path.endsWith('/auth/profile')) {
        expect(request.headers['Authorization'],
            'Bearer synthetic-native-session');
        expect(calls.where((call) => call == 'getToken').length, 1);
        return response('STUDENT');
      }
      return http.Response('{"success":true,"data":[]}', 200);
    });
    await session.restore();
    expect(session.status, SessionStatus.signedIn);
    expect(session.accessError, isNull);
    expect(calls.first, 'initialize');
    // Address refresh can request another token; the profile itself must not ask twice.
    expect(calls.take(2), ['initialize', 'getToken']);
    expect(session.user?.role, 'STUDENT');
  });
  test(
      'incomplete customer goes to profile setup rather than repeating sign-in',
      () async {
    CustomerApiService.httpClientOverride =
        MockClient((_) async => response('STUDENT', needsProfile: true));
    await session.restore();
    expect(session.status, SessionStatus.needsProfile);
  });
  for (final role in ['ADMIN', 'VENDOR', 'DRIVER']) {
    test('$role stays unauthorized with a useful account-specific explanation',
        () async {
      CustomerApiService.httpClientOverride =
          MockClient((_) async => response(role));
      await session.restore();
      expect(session.status, SessionStatus.signedOut);
      expect(session.user, isNull);
      expect(
          session.accessError,
          contains(role == 'ADMIN'
              ? 'administrator'
              : role == 'VENDOR'
                  ? 'store partner'
                  : 'delivery partner'));
      expect(ClerkSessions.instance.identity.value.signedIn, isTrue);
    });
  }
  test('invalid session explains recovery without claiming shopping access',
      () async {
    CustomerApiService.httpClientOverride =
        MockClient((_) async => response('STUDENT', status: 401));
    await session.restore();
    expect(session.status, SessionStatus.signedOut);
    expect(session.accessError, contains('could not verify'));
  });
  test(
      'backend cold start remains retryable and a later customer profile succeeds',
      () async {
    var up = false;
    CustomerApiService.httpClientOverride = MockClient((r) async =>
        r.url.path.endsWith('/auth/profile')
            ? response('STUDENT', status: up ? 200 : 503)
            : http.Response('{"success":true,"data":[]}', 200));
    await session.restore();
    expect(session.status, SessionStatus.unreachable);
    up = true;
    await session.retryRestore();
    expect(session.status, SessionStatus.signedIn);
    expect(session.accessError, isNull);
  });
  test(
      'signed-in SDK with no token has an actionable error instead of a silent loop',
      () async {
    sdkToken = '';
    await session.restore();
    expect(session.status, SessionStatus.signedOut);
    expect(session.accessError, contains('could not supply a session'));
  });
  test('late rejected profile cannot expire a newer successful restore',
      () async {
    final first = Completer<http.Response>();
    var requests = 0;
    CustomerApiService.httpClientOverride = MockClient((r) async {
      if (!r.url.path.endsWith('/auth/profile')) {
        return http.Response('{"success":true,"data":[]}', 200);
      }
      if (++requests == 1) return first.future;
      return response('STUDENT');
    });
    var unauthorized = 0;
    CustomerApiService.onUnauthorized = () {
      unauthorized++;
      session.expire();
    };
    final old = session.restore();
    while (requests == 0) {
      await Future<void>.delayed(Duration.zero);
    }
    await session.restore();
    first.complete(response('STUDENT', status: 401));
    await old;
    expect(session.status, SessionStatus.signedIn);
    expect(unauthorized, 0);
  });
  test('profile completing after sign-out cannot restore private account state',
      () async {
    final pending = Completer<http.Response>();
    var started = false;
    CustomerApiService.httpClientOverride = MockClient((_) async {
      started = true;
      return pending.future;
    });
    final restore = session.restore();
    while (!started) {
      await Future<void>.delayed(Duration.zero);
    }
    session.expire();
    pending.complete(response('STUDENT'));
    await restore;
    expect(session.status, SessionStatus.signedOut);
    expect(session.user, isNull);
  });
  test('native account switch discards a late old-account rejection', () async {
    final pending = Completer<http.Response>();
    var requests = 0;
    CustomerApiService.httpClientOverride = MockClient((request) async {
      if (request.url.path.endsWith('/auth/profile') && ++requests == 1) {
        return pending.future;
      }
      return request.url.path.endsWith('/auth/profile')
          ? response('STUDENT')
          : http.Response('{"success":true,"data":[]}', 200);
    });
    final old = session.restore();
    while (requests == 0) {
      await Future<void>.delayed(Duration.zero);
    }
    await ClerkSessions.instance.switchSession('SyntheticB');
    await session.restore();
    pending.complete(response('STUDENT', status: 401));
    await old;
    expect(session.status, SessionStatus.signedIn);
    expect(session.user?.id, 'internal-SyntheticB');
    expect(session.accessError, isNull);
  });
  testWidgets(
      'Continue shows the backend role explanation in the existing themed entry screen',
      (tester) async {
    CustomerApiService.httpClientOverride =
        MockClient((_) async => response('ADMIN'));
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: session,
        child: MaterialApp(
            theme: KraveoTheme.customer(), home: const AuthScreen())));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Continue to shopping'));
    await tester.pumpAndSettle();
    // The SDK fixture was initialized in real-async service tests above. Drive
    // both native/storage callbacks and Flutter frames until the real outcome.
    await tester.tap(find.text('Continue to shopping'));
    for (var frame = 0; frame < 50 && session.accessError == null; frame++) {
      await tester.pump(const Duration(milliseconds: 20));
      await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    }
    await tester.pumpAndSettle();
    expect(session.accessError, contains('administrator account'));
    expect(find.byKey(const ValueKey('clerk-access-error')), findsOneWidget);
    expect(find.textContaining('administrator account'), findsOneWidget);
    expect(session.status, SessionStatus.signedOut);
    expect(find.text('Your neighbourhood,\ndelivered.'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
}
