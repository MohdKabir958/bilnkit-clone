// Test-only rendering harness. Never imported by a production application.
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

const captureEnabled = bool.fromEnvironment('GROZO_CAPTURE');
const capturePhase = String.fromEnvironment('GROZO_CAPTURE_PHASE', defaultValue: 'after');
final captureKey = GlobalKey();

Future<void> loadVisualFonts() async {
  for (final (family, asset) in [
    ('packages/kraveo_ui/Bricolage', 'packages/kraveo_ui/assets/fonts/BricolageGrotesque.ttf'),
    ('packages/kraveo_ui/Jakarta', 'packages/kraveo_ui/assets/fonts/PlusJakartaSans.ttf'),
    ('packages/lucide_icons_flutter/Lucide', 'packages/lucide_icons_flutter/assets/lucide.ttf'),
    ('packages/kraveo_ui/NotoDevanagari', 'packages/kraveo_ui/assets/fonts/NotoSansDevanagari-Regular.ttf'),
    ('MaterialIcons', 'fonts/MaterialIcons-Regular.otf'),
  ]) {
    await (FontLoader(family)..addFont(rootBundle.load(asset))).load();
  }
}

Future<void> prepareVisual(WidgetTester tester, {double width = 390, double height = 844, double scale = 1}) async {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  tester.platformDispatcher.textScaleFactorTestValue = scale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
}

Widget captureRoot(Widget child) => RepaintBoundary(key: captureKey, child: child);

Future<void> captureVisual(WidgetTester tester, String role, String screen) async {
  await tester.pump(const Duration(seconds: 2));
  await tester.pump(const Duration(seconds: 2));
  final boundary = captureKey.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  await tester.runAsync(() async {
    final image = await boundary.toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    final file = File('../../Docs/ui-ux/$capturePhase/$role/$screen.png');
    await file.parent.create(recursive: true);
    await file.writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}
