import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import 'package:vendor_app/screens/product_inventory_screen.dart';
import '../../../packages/kraveo_ui/test_support/visual_capture.dart';
import 'ui_visual_capture_test.dart' show VisualProductApi;

void main() {
  setUpAll(loadVisualFonts);
  for (final width in [320.0, 360.0, 390.0, 430.0]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('grocery inventory $width at $scale text', (tester) async {
        await prepareVisual(tester, width: width, scale: scale);
        await tester.pumpWidget(captureRoot(MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: KraveoTheme.vendor(),
            home: ProductInventoryScreen(
                vendorId: 'visual-store',
                api: VisualProductApi(lowStockExample: true)))));
        await tester.pump(const Duration(seconds: 1));
        expect(tester.takeException(), isNull);
        final filter = find.byWidgetPredicate(
            (w) => w is KChoiceChip && w.label == 'Low stock');
        await tester.scrollUntilVisible(filter, 150,
            scrollable: find.byType(Scrollable).first);
        await tester.pump();
        await tester.tap(filter);
        await tester.pump();
        expect(tester.widget<KChoiceChip>(filter).selected, isTrue);
        await tester.pump(const Duration(seconds: 1));
        await tester.scrollUntilVisible(find.textContaining('Toned milk'), 200,
            scrollable: find.byType(Scrollable).first);
        expect(find.textContaining('Toned milk'), findsOneWidget);
        expect(find.textContaining('Whole wheat flour'), findsNothing);
        expect(tester.takeException(), isNull);
        if (captureEnabled && width == 320) {
          await captureVisual(tester, 'vendor', 'inventory-320-text-$scale');
        }
      });
    }
  }
}
