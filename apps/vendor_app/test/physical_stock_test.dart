import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vendor_app/screens/physical_stock_screen.dart';
import 'package:vendor_app/services/product_api.dart';
import 'package:vendor_app/services/vendor_api_service.dart';

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await VendorApiService.saveToken('physical-stock-test-token');
  });
  tearDown(() async {
    await VendorApiService.clearToken();
  });
  testWidgets(
      'physical packing retry preserves the original request and warns before returning stock',
      (tester) async {
    tester.view.physicalSize = const Size(1000, 2200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final posts = <Map<String, dynamic>>[];
    final client = MockClient((r) async {
      expect(r.headers['authorization'], 'Bearer physical-stock-test-token');
      if (r.method == 'POST') {
        posts.add(Map<String, dynamic>.from(jsonDecode(r.body)));
        if (posts.length == 1) throw Exception('Offline after submitting');
        return http.Response(jsonEncode({'success': true, 'data': {}}), 200);
      }
      final isLots = r.url.path.endsWith('/batches');
      return http.Response(
          jsonEncode({
            'success': true,
            'data': isLots
                ? []
                : [
                    {
                      'id': 'reservation-a',
                      'orderId': 'order-a',
                      'state': 'HELD',
                      'quantity': 3,
                      'packedQty': 0,
                      'unusableQty': 0,
                      'pendingInspectionQty': 0
                    }
                  ],
            if (isLots) ...{
              'batchTracking': true,
              'stockVersion': 4,
              'nextCursor': null
            }
          }),
          200);
    });
    await tester.pumpWidget(MaterialApp(
        home: PhysicalStockScreen(
            api: ProductApi(client: client),
            product: const {'id': 'milk', 'name': 'Fresh milk'})));
    await tester.pumpAndSettle();
    expect(find.textContaining('Cancelled packed products'), findsOneWidget);
    await tester.tap(find.widgetWithText(OutlinedButton, 'PACK'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).at(0), '2');
    await tester.enterText(
        find.byType(TextFormField).at(1), 'Counted sealed packs');
    await tester.tap(find.text('Record change'));
    await tester.pumpAndSettle();
    expect(find.text('Retry unconfirmed change'), findsOneWidget);
    await tester.tap(find.text('Retry unconfirmed change'));
    await tester.pumpAndSettle();
    expect(posts, hasLength(2));
    expect(posts[1], posts[0]);
    expect(posts[0]['quantity'], 2);
    expect(find.text('Retry unconfirmed change'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'a cancelled packed reservation exposes inspection instead of packing controls',
      (tester) async {
    final api = ProductApi(
        client: MockClient((r) async => http.Response(
            jsonEncode({
              'success': true,
              'data': r.url.path.endsWith('/batches')
                  ? []
                  : [
                      {
                        'id': 'return-a',
                        'orderId': 'cancelled-order',
                        'state': 'AWAITING_INSPECTION',
                        'quantity': 2,
                        'packedQty': 2,
                        'unusableQty': 0,
                        'pendingInspectionQty': 2
                      }
                    ],
              'batchTracking': false,
              'stockVersion': 1,
              'nextCursor': null
            }),
            200)));
    await tester.pumpWidget(MaterialApp(
        home: PhysicalStockScreen(
            api: api, product: const {'id': 'milk', 'name': 'Fresh milk'})));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('RETURN'), 200,
        scrollable: find.byType(Scrollable).first);
    expect(find.widgetWithText(OutlinedButton, 'PACK'), findsNothing);
    expect(find.text('WRITE OFF'), findsOneWidget);
    await tester.tap(find.text('RETURN'));
    await tester.pumpAndSettle();
    expect(find.textContaining('sealed, safe and unexpired'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
  });
}
