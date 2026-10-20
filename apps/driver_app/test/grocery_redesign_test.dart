import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import 'package:driver_app/widgets/duty_toggle.dart';
import 'package:driver_app/widgets/swipe_accept_card.dart';
import 'package:driver_app/models/order_view.dart';
import '../../../packages/kraveo_ui/test_support/visual_capture.dart';
import 'support/fake_rider.dart';

void main() {
  setUpAll(loadVisualFonts);
  testWidgets('server offer deadline disables claiming after expiry',
      (tester) async {
    await prepareVisual(tester);
    var claims = 0;
    final view = OrderView.tryParse(orderJson(pool: true)
      ..['dispatchOffer'] = {
        'id': 'test-offer',
        'expiresAt':
            testNow.add(const Duration(seconds: 2)).toUtc().toIso8601String(),
      })!;
    await tester.pumpWidget(MaterialApp(
        theme: KraveoTheme.driver(),
        home: Scaffold(
            body: SingleChildScrollView(
                child: OfferCard(
                    order: view, now: testNow, onAccepted: () => claims++)))));
    expect(find.text('OFFER EXPIRES IN 0:02'), findsOneWidget);
    await tester.pump(const Duration(seconds: 3));
    expect(find.text('Offer expired · Refresh for new offers'), findsOneWidget);
    final action = find.byWidgetPredicate(
        (widget) => widget is KButton && widget.label == 'Offer expired');
    expect(tester.widget<KButton>(action).onPressed, isNull);
    expect(claims, 0);
    await tester.pumpWidget(const SizedBox());
    expect(tester.binding.transientCallbackCount, 0);
  });
  for (final width in [320.0, 360.0, 390.0, 430.0]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('duty and delivery offer $width at $scale text',
          (tester) async {
        await prepareVisual(tester, width: width, scale: scale);
        var requests = 0;
        final view = OrderView.tryParse(orderJson())!;
        await tester.pumpWidget(captureRoot(MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: KraveoTheme.driver(),
            home: Scaffold(
                body: ListView(padding: const EdgeInsets.all(20), children: [
              DutyToggle(isOnline: false, onChanged: (_) => requests++),
              const SizedBox(height: 16),
              OfferCard(order: view, now: testNow, onAccepted: () => requests++)
            ])))));
        await tester.pump(const Duration(seconds: 1));
        expect(tester.takeException(), isNull);
        await tester.tap(find.byType(DutyToggle));
        await tester.pump();
        expect(requests, 1);
        expect(find.text('OFF DUTY'), findsOneWidget,
            reason: 'only a server-confirmed duty update changes state');
        if (captureEnabled && width == 320) {
          await captureVisual(tester, 'delivery', 'offer-320-text-$scale');
        }
      });
    }
  }
}
