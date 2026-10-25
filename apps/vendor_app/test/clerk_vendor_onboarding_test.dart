// Native Clerk and HTTP fixtures. These do not claim a real provider or device login.
import 'dart:convert';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vendor_app/main.dart';
import 'package:vendor_app/models/partner_session.dart';
import 'package:vendor_app/screens/application_status_screen.dart';
import 'package:vendor_app/screens/signup_screen.dart';
import 'package:vendor_app/screens/login_screen.dart';
import 'package:vendor_app/screens/vendor_home.dart';
import 'package:vendor_app/services/partner_auth_service.dart';
import 'package:vendor_app/services/store_categories.dart';
import '../../../packages/kraveo_ui/test_support/visual_capture.dart';

const user = {'id': 'owner-1', 'name': 'Synthetic Owner', 'role': 'STUDENT'};
const pending = {
  'success': true,
  'user': {'id': 'owner-1', 'name': 'Synthetic Owner', 'role': 'VENDOR'},
  'approvalStatus': 'PENDING',
  'vendor': {
    'id': 'store-1',
    'name': 'Synthetic Grocery',
    'primaryCategoryId': 'groceries',
    'category': 'Grocery stores',
    'hasLocation': false,
    'isAcceptingOrders': false
  }
};
const categories = [
  StoreCategory('groceries', 'Grocery stores', 'किराना स्टोर')
];

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

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  if (!GrozoAuthConfig.usesClerk) {
    test('run the onboarding regressions explicitly with AUTH_MODE=clerk-test',
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
          'userId': 'user_Owner',
          'sessionId': 'sess_Owner',
          'name': 'Synthetic Owner'
        };
      }
      if (call.method == 'getToken') return 'explicit-native-fixture-token';
      if (call.method == 'signOut') {
        return {'localCleared': true, 'remoteRevoked': true};
      }
      return null;
    });
    await ClerkSessions.instance.authenticate();
  });
  test(
      'unregistered identity is pending and cannot become approved through copies or persistence',
      () {
    final session = PartnerSession.fromMeJson({
      'user': user,
      'requiresApplication': true,
      'approvalStatus': 'APPROVED'
    })!;
    expect(session.requiresApplication, true);
    expect(session.isApproved, false);
    expect(
        session.copyWith(approval: PartnerApproval.approved).isApproved, false);
    expect(PartnerSession.fromStoredJson(session.toJson())!.requiresApplication,
        true);
  });
  test(
      'Clerk profile uses onboarding route; HTTP outage and role conflict retain actionable reasons',
      () async {
    await http.runWithClient(() async {
      final profile = await ApiPartnerAuthService().fetchProfile('fixture');
      expect(profile.outcome, ProfileOutcome.valid);
      expect(profile.session!.requiresApplication, true);
    },
        () => MockClient((req) async {
              expect(req.url.path, endsWith('/partner/vendor/onboarding'));
              expect(req.headers['Authorization'], 'Bearer fixture');
              return http.Response(
                  jsonEncode({
                    'user': user,
                    'requiresApplication': true,
                    'approvalStatus': 'PENDING'
                  }),
                  200);
            }));
    for (final status in [403, 503]) {
      await http.runWithClient(() async {
        final result =
            await ApiPartnerAuthService().login(phone: '', password: '');
        expect(result.ok, false);
        expect(result.message, 'Use a separate store-owner account.');
        expect(result.failure,
            status == 403 ? LoginFailure.wrongRole : LoginFailure.offline);
      },
          () => MockClient((_) async => http.Response(
              jsonEncode({'message': 'Use a separate store-owner account.'}),
              status)));
    }
  });
  test(
      'Clerk owner profile retains every approval state without granting access early',
      () async {
    for (final status in ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']) {
      final api = ApiPartnerAuthService(
          client: MockClient((_) async => http.Response(
              jsonEncode({...pending, 'approvalStatus': status}), 200)));
      final result = await api.fetchProfile('fixture');
      expect(result.outcome, ProfileOutcome.valid);
      expect(result.session!.requiresApplication, false);
      expect(result.session!.isApproved, status == 'APPROVED');
      expect(result.session!.primaryCategoryId, 'groceries');
    }
  });
  testWidgets(
      'welcome preserves actionable account role errors instead of generic connection text',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        theme: KraveoTheme.vendor(),
        home: LoginScreen(
            onSubmit: (_, __) async => const LoginResult.failure(
                LoginFailure.wrongRole,
                message: 'Use a separate store-owner account.'))));
    await settle(tester);
    await tester.ensureVisible(find.text('Open my store'));
    await tester.tap(find.text('Open my store'));
    await settle(tester);
    expect(find.text('Use a separate store-owner account.'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await settle(tester);
  });
  test(
      'malformed application success is not treated as a created store and password is never sent',
      () async {
    await http.runWithClient(() async {
      final result = await ApiPartnerAuthService().signUp(
          const PartnerSignupForm(
              ownerName: 'Synthetic Owner',
              phone: '9000000014',
              password: 'never-send',
              restaurantName: 'Synthetic Grocery',
              address: 'Synthetic pickup street',
              primaryCategoryId: 'groceries'));
      expect(result.ok, false);
      expect(result.failure, SignupFailure.server);
    },
        () => MockClient((req) async {
              final body = jsonDecode(req.body);
              expect(body.containsKey('password'), false);
              expect(body['primaryCategoryId'], 'groceries');
              return http.Response('{"success":true}', 201);
            }));
  });
  testWidgets(
      'Clerk store form exposes contact, hides password, shows validation, submits only once',
      (tester) async {
    var calls = 0;
    final response = Completer<SignupResult>();
    PartnerSignupForm? sent;
    await tester.pumpWidget(MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: KraveoTheme.vendor(),
        home: SignupScreen(
            categoriesLoader: () async => categories,
            onSubmit: (form) async {
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
    await type(tester, 'restaurant-field', 'Synthetic Grocery');
    await type(tester, 'address-field', 'Synthetic pickup street');
    await tap(tester, 'category-groceries');
    await type(tester, 'phone-field', '9000000014');
    await tap(tester, 'signup-button');
    expect(calls, 1);
    await tap(tester, 'signup-button');
    expect(calls, 1);
    response.complete(SignupResult.success(
        token: 'fixture', session: PartnerSession.fromMeJson(pending)));
    await settle(tester);
    expect(sent!.primaryCategoryId, 'groceries');
    expect(sent!.phone, '9000000014');
    expect(sent!.password, '');
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await settle(tester);
  });
  testWidgets(
      'real auth gate routes fresh Clerk owner to registration then pending, never store dashboard',
      (tester) async {
    final posts = <http.Request>[];
    final client = MockClient((req) async {
      if (req.method == 'POST' && req.url.path.endsWith('/clerk-application')) {
        posts.add(req);
        return http.Response(jsonEncode(pending), 201);
      }
      return http.Response(
          jsonEncode(posts.isEmpty
              ? {
                  'success': true,
                  'user': user,
                  'requiresApplication': true,
                  'approvalStatus': 'PENDING'
                }
              : pending),
          200);
    });
    await http.runWithClient(() async {
      await tester.pumpWidget(KraveoVendorApp(
          auth: ApiPartnerAuthService(client: client),
          categoriesLoader: () async => categories));
      await settle(tester);
      expect(find.byType(SignupScreen), findsOneWidget);
      expect(find.byType(VendorHomeScreen), findsNothing);
      await type(tester, 'restaurant-field', 'Synthetic Grocery');
      await type(tester, 'address-field', 'Synthetic pickup street');
      await tap(tester, 'category-groceries');
      await type(tester, 'phone-field', '9000000014');
      await tap(tester, 'signup-button');
      expect(posts, hasLength(1));
      expect(find.byType(SignupScreen), findsNothing);
      expect(find.byType(ApplicationStatusScreen), findsOneWidget);
      expect(find.byType(VendorHomeScreen), findsNothing);
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 6));
    },
        () => MockClient((req) async {
              if (req.method == 'POST' &&
                  req.url.path.endsWith('/clerk-application')) {
                posts.add(req);
                return http.Response(jsonEncode(pending), 201);
              }
              if (req.url.path.endsWith('/categories')) {
                return http.Response(
                    '{"data":[{"id":"groceries","name":"Grocery stores","nameHi":"किराना स्टोर"}]}',
                    200);
              }
              if (req.url.path.endsWith('/onboarding')) {
                return http.Response(
                    jsonEncode(posts.isEmpty
                        ? {
                            'success': true,
                            'user': user,
                            'requiresApplication': true,
                            'approvalStatus': 'PENDING'
                          }
                        : pending),
                    200);
              }
              return http.Response('{}', 404);
            }));
  });
  testWidgets(
      'category load failure has retry and cannot submit an unclassified store',
      (tester) async {
    var calls = 0, loads = 0;
    await tester.pumpWidget(MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: KraveoTheme.vendor(),
        home: SignupScreen(categoriesLoader: () async {
          loads++;
          if (loads == 1) throw Exception('fixture offline');
          return categories;
        }, onSubmit: (_) async {
          calls++;
          return const SignupResult.failure(SignupFailure.server);
        })));
    await settle(tester);
    expect(find.text('Retry categories'), findsOneWidget);
    await tap(tester, 'signup-button');
    expect(calls, 0);
    await tester.ensureVisible(find.text('Retry categories'));
    await tester.tap(find.text('Retry categories'));
    await settle(tester);
    expect(find.byKey(const ValueKey('category-groceries')), findsOneWidget);
    expect(loads, 2);
    await tester.pumpWidget(const SizedBox());
    await settle(tester);
  });
  testWidgets(
      'capture actual store registration UI with explicit synthetic fixtures',
      (tester) async {
    await prepareVisual(tester, width: 390, height: 844);
    await tester.pumpWidget(captureRoot(MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: KraveoTheme.vendor(),
        home: SignupScreen(
            categoriesLoader: () async => categories,
            onSubmit: (_) async =>
                const SignupResult.failure(SignupFailure.server)))));
    await settle(tester);
    await type(tester, 'restaurant-field', 'Synthetic Grocery');
    await type(tester, 'address-field', 'Demonstration pickup street');
    if (captureEnabled) {
      final scrollable = find.byType(Scrollable).first;
      tester.state<ScrollableState>(scrollable).position.jumpTo(0);
      await captureVisual(tester, 'vendor', 'store-registration-top');
      await type(tester, 'phone-field', '9000000014');
      await tap(tester, 'category-groceries');
      await tester.ensureVisible(find.byKey(const ValueKey('signup-button')));
      await captureVisual(tester, 'vendor', 'store-registration-submit');
    }
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await settle(tester);
  });
}
