import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kraveo_ui/kraveo_ui.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('in.grozo/clerk_unit_fixture');
  late StreamController<dynamic> events;
  late ClerkSessions client;
  final calls = <MethodCall>[];
  const state = {
    'ready': true,
    'signedIn': true,
    'userId': 'user_FixtureA',
    'sessionId': 'sess_FixtureA',
    'name': 'Synthetic Tester',
    'email': 'synthetic@example.test'
  };
  setUp(() {
    events = StreamController<dynamic>.broadcast();
    calls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      calls.add(call);
      switch (call.method) {
        case 'initialize':
        case 'authenticate':
          return state;
        case 'getToken':
          return 'fixture-only-token-${calls.length}';
        case 'signOut':
          return {'localCleared': true, 'remoteRevoked': false};
        case 'setActiveSession':
          return {
            ...state,
            'userId': 'user_FixtureB',
            'sessionId': 'sess_FixtureB'
          };
      }
      return null;
    });
    client = ClerkSessions(channel: channel, events: events.stream);
  });
  tearDown(() async {
    await client.dispose();
    await events.close();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });
  test('initialization reads native identity without requesting a Grozo token',
      () async {
    await client.initialize();
    expect(client.identity.value.userId, 'user_FixtureA');
    expect(calls.map((c) => c.method), ['initialize']);
  });
  test('each token request reaches SDK and refresh flag is forwarded',
      () async {
    final first = await client.token();
    final second = await client.token(forceRefresh: true);
    expect(first, isNot(second));
    expect(calls.last.arguments, {'forceRefresh': true});
  });
  test('old-account in-flight token is discarded after native session switch',
      () async {
    await client.initialize();
    final pending = Completer<String>();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel,
            (call) async => call.method == 'getToken' ? pending.future : state);
    final future = client.token();
    await Future<void>.delayed(Duration.zero);
    events.add(
        {...state, 'userId': 'user_FixtureB', 'sessionId': 'sess_FixtureB'});
    await Future<void>.delayed(Duration.zero);
    pending.complete('old-account-token');
    expect(await future, isNull);
  });
  test(
      'logout clears local identity without falsely claiming remote revocation',
      () async {
    await client.initialize();
    expect(await client.signOut(), isFalse);
    expect(client.identity.value.signedIn, isFalse);
    expect(await client.token(), isNull);
    expect(calls.last.method, 'signOut');
  });
  test('native signed-in event cannot silently undo local logout', () async {
    await client.initialize();
    await client.signOut();
    events.add(state);
    await Future<void>.delayed(Duration.zero);
    expect(await client.token(), isNull);
    expect(client.identity.value.signedIn, isFalse);
  });
  test('account cleanup runs before native account selection', () async {
    await client.initialize();
    client.beforeAccountChange = () async {
      expect(calls.last.method, 'initialize');
    };
    await client.switchSession('sess_FixtureB');
    expect(client.identity.value.userId, 'user_FixtureB');
    expect(calls.last.arguments, {'sessionId': 'sess_FixtureB'});
  });
  test('cancellation is distinct from a successful sign-in', () async {
    await client.initialize();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel,
            (_) async => throw PlatformException(code: 'AUTH_CANCELLED'));
    expect(await client.authenticate(), isFalse);
  });
  test(
      'SDK refresh outage remains an error rather than a fake signed-out response',
      () async {
    await client.initialize();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel,
            (_) async => throw PlatformException(code: 'TOKEN_UNAVAILABLE'));
    await expectLater(client.token(), throwsA(isA<PlatformException>()));
    expect(client.identity.value.signedIn, isTrue);
  });
  test('unsupported flow cannot invoke native authentication', () async {
    await expectLater(
        client.authenticate(mode: 'untrusted-browser'), throwsArgumentError);
    expect(calls.where((c) => c.method == 'authenticate'), isEmpty);
  });
  testWidgets(
      'preview labels unavailable business operations and uses native auth',
      (tester) async {
    var continued = 0;
    await tester.pumpWidget(MaterialApp(
        home: ClerkEntryScreen(
            appName: 'Grozo Fixture',
            preview: true,
            client: client,
            onContinue: () async {
              continued++;
            })));
    await tester.pumpAndSettle();
    expect(find.textContaining('staging backend is not configured'),
        findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    await tester.ensureVisible(find.text('Continue with Clerk'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue with Clerk'));
    await tester.pumpAndSettle();
    expect(calls.where((c) => c.method == 'authenticate').length, 1);
    expect(continued, 1);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
