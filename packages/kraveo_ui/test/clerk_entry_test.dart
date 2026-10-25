import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kraveo_ui/kraveo_ui.dart';

void main() {
  const channel = MethodChannel('in.grozo/entry_fixture');
  late ClerkSessions client;
  late StreamController<dynamic> events;
  final calls = <MethodCall>[];
  var signedIn = false;
  var verified = 0;
  Map<String, dynamic> state() => {
        'ready': true,
        'signedIn': signedIn,
        if (signedIn) 'userId': 'user_RenderFixture',
        if (signedIn) 'sessionId': 'sess_RenderFixture',
        if (signedIn) 'email': 'synthetic@example.test'
      };
  setUp(() {
    signedIn = false;
    verified = 0;
    calls.clear();
    events = StreamController<dynamic>.broadcast();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      calls.add(call);
      if (call.method == 'authenticate') {
        signedIn = true;
      }
      return state();
    });
    client = ClerkSessions(channel: channel, events: events.stream);
  });
  tearDown(() async {
    await client.dispose();
    await events.close();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });
  Widget host(ClerkEntryRole role) => MaterialApp(
      theme: switch (role) {
        ClerkEntryRole.customer => KraveoTheme.customer(),
        ClerkEntryRole.vendor => KraveoTheme.vendor(),
        ClerkEntryRole.delivery => KraveoTheme.driver(),
      },
      home: ClerkEntryScreen(
          appName: 'Grozo',
          role: role,
          client: client,
          onContinue: () async {
            verified++;
          },
          onApply: () {}));
  for (final role in ClerkEntryRole.values) {
    testWidgets('$role remains usable at narrow width and large text',
        (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      tester.platformDispatcher.textScaleFactorTestValue = 1.6;
      addTearDown(tester.view.reset);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await tester.pumpWidget(host(role));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Get started'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.byType(TextField), findsNothing);
      await tester.tap(find.text('Get started'));
      await tester.pumpAndSettle();
      expect(calls.last.method, 'authenticate');
      expect(calls.last.arguments, {'mode': 'signInOrUp'});
      expect(verified, 1);
      expect(find.text('Apply for partner approval'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });
  }
  testWidgets(
      'recovery delegates to native SDK; signed-in continue rechecks Grozo',
      (tester) async {
    await tester.pumpWidget(host(ClerkEntryRole.customer));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Sign in or recover your account'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign in or recover your account'));
    await tester.pumpAndSettle();
    expect(calls.last.arguments, {'mode': 'signIn'});
    expect(verified, 1);
    await tester.ensureVisible(find.text('Continue to shopping'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue to shopping'));
    await tester.pumpAndSettle();
    expect(verified, 2);
    expect(calls.where((c) => c.method == 'authenticate').length, 1);
    await tester.pumpWidget(const SizedBox());
  });
}
