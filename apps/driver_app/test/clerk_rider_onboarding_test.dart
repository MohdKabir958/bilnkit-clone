// Explicit native Clerk / HTTP fixtures; no hosted provider or real-device authentication is claimed.
import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:driver_app/main.dart';
import 'package:driver_app/models/partner_session.dart';
import 'package:driver_app/screens/application_status_screen.dart';
import 'package:driver_app/screens/driver_home_screen.dart';
import 'package:driver_app/screens/login_screen.dart';
import 'package:driver_app/screens/signup_screen.dart';
import 'package:driver_app/services/partner_auth_service.dart';
import '../../../packages/kraveo_ui/test_support/visual_capture.dart';

const newUser = {
  'id': 'rider-owner-1',
  'name': 'Synthetic Rider',
  'role': 'STUDENT'
};
const pending = {
  'success': true,
  'user': {'id': 'rider-owner-1', 'name': 'Synthetic Rider', 'role': 'DRIVER'},
  'approvalStatus': 'PENDING',
  'requiresApplication': false,
  'driver': {
    'id': 'rider-1',
    'runnerCode': 'RUN-1001',
    'vehicleType': 'Bike',
    'vehicleRegNo': 'KA01AB1234',
    'dutyStatus': 'OFFLINE',
    'serviceAreaConfigured': false
  }
};
Future<void> settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(seconds: 1));
  for (var i = 0; i < 8; i++) {
    await tester
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 1)));
    await tester.pump(const Duration(milliseconds: 200));
  }
}

Future<void> type(WidgetTester tester, String key, String value) async {
  final field = find.byKey(ValueKey(key));
  await tester.ensureVisible(field);
  await tester.pump();
  await tester.enterText(field, value);
  await tester.pump();
}

Future<void> tap(WidgetTester tester, String key) async {
  final button = find.byKey(ValueKey(key));
  await tester.ensureVisible(button);
  await tester.pump();
  await tester.tap(button);
  await settle(tester);
}

Widget host(Widget child) => MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: KraveoTheme.driver(),
    home: child);
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  if (!GrozoAuthConfig.usesClerk) {
    test(
        'run rider onboarding regressions explicitly with AUTH_MODE=clerk-test',
        () => expect(GrozoAuthConfig.mode, 'legacy'));
    return;
  }
  setUpAll(loadVisualFonts);
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(
        const MethodChannel('in.grozo/clerk/events'), (_) async => null);
    messenger.setMockMethodCallHandler(const MethodChannel('in.grozo/clerk'),
        (call) async {
      if (call.method == 'initialize' || call.method == 'authenticate') {
        return {
          'ready': true,
          'signedIn': true,
          'userId': 'user_RiderApplicant',
          'sessionId': 'sess_RiderApplicant',
          'name': 'Synthetic Rider'
        };
      }
      if (call.method == 'getToken') return 'explicit-native-rider-fixture';
      if (call.method == 'signOut') {
        return {'localCleared': true, 'remoteRevoked': true};
      }
      return null;
    });
    await ClerkSessions.instance.authenticate();
  });
  test(
      'identity without application cannot become approved through copies or stored data',
      () {
    final session = PartnerSession.fromMeJson({
      'user': newUser,
      'requiresApplication': true,
      'approvalStatus': 'APPROVED'
    })!;
    expect(session.requiresApplication, true);
    expect(session.approval, PartnerApproval.pending);
    expect(session.isApproved, false);
    expect(
        session.copyWith(approval: PartnerApproval.approved).isApproved, false);
    expect(PartnerSession.fromStoredJson(session.toJson())!.requiresApplication,
        true);
    expect(session.withUserFrom(session).requiresApplication, true);
  });
  test(
      'Clerk profile discovers onboarding using bearer authentication and validates role',
      () async {
    for (final body in [
      {
        'user': newUser,
        'requiresApplication': true,
        'approvalStatus': 'PENDING'
      },
      {'user': newUser, 'approvalStatus': 'APPROVED'},
      {
        'user': {'id': 'other', 'role': 'ADMIN'},
        'requiresApplication': true,
        'approvalStatus': 'PENDING'
      }
    ]) {
      final api = ApiPartnerAuthService(client: MockClient((request) async {
        expect(request.url.path, endsWith('/partner/driver/onboarding'));
        expect(request.headers['Authorization'], 'Bearer fixture');
        return http.Response(jsonEncode(body), 200);
      }));
      final result = await api.fetchProfile('fixture');
      expect(
          result.outcome,
          body['requiresApplication'] == true &&
                  (body['user'] as Map)['role'] == 'STUDENT'
              ? ProfileOutcome.valid
              : ProfileOutcome.unauthorized);
    }
  });
  test(
      'all approval states remain authoritative and keep the owned rider identifier',
      () async {
    for (final status in ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']) {
      final api = ApiPartnerAuthService(
          client: MockClient((_) async => http.Response(
              jsonEncode({...pending, 'approvalStatus': status}), 200)));
      final result = await api.fetchProfile('fixture');
      expect(result.outcome, ProfileOutcome.valid);
      expect(result.session!.driverId, 'rider-1');
      expect(result.session!.isApproved, status == 'APPROVED');
      expect(result.session!.requiresApplication, false);
    }
  });
  test('server suspension stays denied and is identified as account paused',
      () async {
    final api = ApiPartnerAuthService(
        client: MockClient((_) async => http.Response(
            '{"success":false,"code":"ACCOUNT_SUSPENDED","message":"Delivery partner access is suspended."}',
            403)));
    final result = await api.fetchProfile('fixture');
    expect(result.outcome, ProfileOutcome.unauthorized);
    expect(result.suspended, true);
    expect(result.session, isNull);
    expect(result.message, 'Delivery partner access is suspended.');
  });
  test('role conflicts and network outages preserve useful explanations',
      () async {
    for (final status in [403, 409, 503]) {
      final api = ApiPartnerAuthService(
          client: MockClient((_) async => http.Response(
              '{"message":"Use a separate delivery-partner account."}',
              status)));
      final result = await api.login(phone: '', password: '');
      expect(result.ok, false);
      expect(result.message, 'Use a separate delivery-partner account.');
      expect(result.failure,
          status == 503 ? LoginFailure.offline : LoginFailure.wrongRole);
    }
  });
  test(
      'application requires a real rider profile, sends no password, reports server refusal',
      () async {
    for (final status in [201, 403]) {
      final api = ApiPartnerAuthService(client: MockClient((request) async {
        final body = jsonDecode(request.body) as Map;
        expect(body.containsKey('password'), false);
        expect(body['role'], 'DRIVER');
        expect(body['vehicleType'], 'Cycle');
        return http.Response(
            '{"success":true,"message":"Use a separate delivery-partner account."}',
            status);
      }));
      final result = await api.signUp(const PartnerSignupForm(
          name: 'Synthetic Rider',
          phone: '9000000015',
          password: 'never-send',
          vehicleType: 'Cycle'));
      expect(result.ok, false);
      expect(result.failure,
          status == 201 ? SignupFailure.server : SignupFailure.invalid);
      expect(result.message, isNotEmpty);
    }
  });
  testWidgets(
      'welcome shows the real account conflict rather than a generic connection error',
      (tester) async {
    await tester.pumpWidget(host(LoginScreen(
        onSubmit: (_, __) async => const LoginResult.failure(
            LoginFailure.wrongRole,
            message: 'Use a separate delivery-partner account.'))));
    await settle(tester);
    await tester.ensureVisible(find.text('Open rider dashboard'));
    await tester.tap(find.text('Open rider dashboard'));
    await settle(tester);
    expect(
        find.text('Use a separate delivery-partner account.'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await settle(tester);
  });
  testWidgets(
      'visible contact and vehicle validation prevent silent submission; double taps create one application',
      (tester) async {
    var calls = 0;
    PartnerSignupForm? sent;
    final response = Completer<SignupResult>();
    await tester.pumpWidget(host(SignupScreen(onSubmit: (form) async {
      calls++;
      sent = form;
      return response.future;
    })));
    await settle(tester);
    expect(find.byKey(const ValueKey('phone-field')), findsOneWidget);
    expect(find.byKey(const ValueKey('password-field')), findsNothing);
    await tap(tester, 'signup-button');
    expect(calls, 0);
    expect(find.byKey(const ValueKey('signup-problem')), findsOneWidget);
    await type(tester, 'phone-field', '9000000015');
    await type(tester, 'plate-field', 'KA01AB1234');
    await tap(tester, 'signup-button');
    await tap(tester, 'signup-button');
    expect(calls, 1);
    response.complete(SignupResult.success(
        token: 'fixture', session: PartnerSession.fromMeJson(pending)));
    await settle(tester);
    expect(sent!.password, '');
    expect(sent!.vehicleType, 'Bike');
    expect(sent!.vehicleRegNo, 'KA01AB1234');
    expect(sent!.name, 'Synthetic Rider');
    await tester.pumpWidget(const SizedBox());
    await settle(tester);
  });
  testWidgets(
      'real auth gate routes new Clerk rider into signup then pending, never delivery work',
      (tester) async {
    final posts = <http.Request>[];
    final api = ApiPartnerAuthService(client: MockClient((request) async {
      if (request.method == 'POST' &&
          request.url.path.endsWith('/clerk-application')) {
        posts.add(request);
        return http.Response(jsonEncode(pending), 201);
      }
      return http.Response(
          jsonEncode(posts.isEmpty
              ? {
                  'success': true,
                  'user': newUser,
                  'requiresApplication': true,
                  'approvalStatus': 'PENDING'
                }
              : pending),
          200);
    }));
    await tester.pumpWidget(KraveoDriverApp(auth: api));
    await settle(tester);
    expect(find.byType(SignupScreen), findsOneWidget);
    expect(find.byType(DriverHomeScreen), findsNothing);
    await type(tester, 'phone-field', '9000000015');
    await type(tester, 'plate-field', 'KA01AB1234');
    await tap(tester, 'signup-button');
    expect(posts, hasLength(1));
    expect(find.byType(SignupScreen), findsNothing);
    expect(find.byType(ApplicationStatusScreen), findsOneWidget);
    expect(find.byType(DriverHomeScreen), findsNothing);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 6));
  });
  testWidgets(
      'cycle application works without a plate and the dark form fits a small phone at large text',
      (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.3;
    addTearDown(tester.view.reset);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    PartnerSignupForm? sent;
    await tester.pumpWidget(host(SignupScreen(onSubmit: (form) async {
      sent = form;
      return const SignupResult.failure(SignupFailure.offline);
    })));
    await settle(tester);
    await type(tester, 'phone-field', '9000000015');
    await tap(tester, 'vehicle-Cycle');
    await tap(tester, 'signup-button');
    expect(sent!.vehicleType, 'Cycle');
    expect(sent!.vehicleRegNo, '');
    expect(tester.takeException(), isNull);
    expect(find.textContaining("Can't reach Grozo"), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await settle(tester);
  });
  testWidgets(
      'capture actual rider registration UI using clearly synthetic data',
      (tester) async {
    await prepareVisual(tester, width: 390, height: 844);
    await tester.pumpWidget(captureRoot(host(SignupScreen(
        onSubmit: (_) async =>
            const SignupResult.failure(SignupFailure.server)))));
    await settle(tester);
    await type(tester, 'phone-field', '9000000015');
    await type(tester, 'plate-field', 'KA01AB1234');
    if (captureEnabled) {
      tester
          .state<ScrollableState>(find.byType(Scrollable).first)
          .position
          .jumpTo(0);
      await captureVisual(tester, 'delivery', 'rider-registration-top');
      await tester.ensureVisible(find.byKey(const ValueKey('signup-button')));
      await captureVisual(tester, 'delivery', 'rider-registration-submit');
    }
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await settle(tester);
  });
}
