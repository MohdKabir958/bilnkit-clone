import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kraveo_ui/kraveo_ui.dart';

double luminance(Color color) {
  double linear(double v) =>
      v <= .04045 ? v / 12.92 : math.pow((v + .055) / 1.055, 2.4).toDouble();
  return .2126 * linear(color.r) +
      .7152 * linear(color.g) +
      .0722 * linear(color.b);
}

double contrast(Color a, Color b) {
  final x = luminance(a), y = luminance(b);
  return (math.max(x, y) + .05) / (math.min(x, y) + .05);
}

void main() {
  testWidgets('pressable supports keyboard activation and disabled actions',
      (tester) async {
    var taps = 0;
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: Column(children: [
      KPressable(onTap: () => taps++, child: const Text('Choose product')),
      const KPressable(child: Text('Unavailable'))
    ]))));
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    expect(taps, 1);
    await tester.sendKeyEvent(LogicalKeyboardKey.space);
    expect(taps, 2);
    expect(tester.takeException(), isNull);
  });
  test('semantic body, muted, faint and primary-action roles meet AA contrast',
      () {
    for (final tokens in [
      KraveoTokens.customer,
      KraveoTokens.vendor,
      KraveoTokens.driver
    ]) {
      for (final surface in [tokens.bg, tokens.surface, tokens.surfaceAlt])
        for (final ink in [tokens.ink, tokens.inkMuted, tokens.inkFaint])
          expect(contrast(ink, surface), greaterThanOrEqualTo(4.5));
      expect(contrast(tokens.brand, tokens.onBrand), greaterThanOrEqualTo(4.5));
      expect(
          contrast(tokens.accent, tokens.onAccent), greaterThanOrEqualTo(4.5));
    }
  });
  testWidgets(
      'reduced motion stops shared reveal, number and skeleton animations',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        theme: KraveoTheme.customer(),
        home: MediaQuery(
            data: const MediaQueryData(disableAnimations: true),
            child: Scaffold(
                body: Column(children: [
              const KSkeleton(height: 30),
              const KReveal(child: Text('Ready')),
              const KAnimatedNumber(value: 125, prefix: '₹'),
              KButton(label: 'Continue', onPressed: () {}),
              const KStatusPill(status: KStatus.preparing)
            ])))));
    await tester.pump();
    expect(find.text('₹125'), findsOneWidget);
    expect(find.text('Ready'), findsOneWidget);
    expect(tester.binding.transientCallbackCount, 0);
  });
  testWidgets('button grows for enlarged text instead of clipping its action',
      (tester) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await tester.pumpWidget(MaterialApp(
        theme: KraveoTheme.vendor(),
        home: Scaffold(
            body: Padding(
                padding: const EdgeInsets.all(20),
                child: KButton(
                    label: 'Confirm stock adjustment', onPressed: () {})))));
    expect(
        tester.getSize(find.byType(KButton)).height, greaterThanOrEqualTo(64));
    expect(tester.takeException(), isNull);
  });
}
