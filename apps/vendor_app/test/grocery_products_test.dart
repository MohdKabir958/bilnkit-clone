import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vendor_app/services/product_api.dart';
import 'package:vendor_app/services/vendor_api_service.dart';
import 'package:vendor_app/screens/product_inventory_screen.dart';

Map<String, dynamic> product(String id) => {
      'id': id,
      'vendorId': 'store-a',
      'name': 'Milk $id',
      'sku': 'MILK-$id',
      'productKey': 'milk',
      'unit': 'ml',
      'packSize': '500',
      'pricePaise': 6545,
      'mrpPaise': 7000,
      'stockQty': 3,
      'stockVersion': 7,
      'lowStock': true,
      'lowStockThreshold': 5,
      'active': true,
      'categoryId': 'dairy',
      'description': 'Fresh sealed milk',
      'approvalStatus': 'APPROVED',
      'imageUrls': []
    };
http.Response json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status,
        headers: {'content-type': 'application/json'});
void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await VendorApiService.saveToken('vendor-test-token');
  });
  tearDown(() async {
    await VendorApiService.clearToken();
  });
  testWidgets(
      'inventory pages stay separate and load more authenticated products',
      (tester) async {
    final paths = <Uri>[];
    final api = ProductApi(client: MockClient((r) async {
      paths.add(r.url);
      expect(r.headers['authorization'], 'Bearer vendor-test-token');
      return json({
        'success': true,
        'data': [product(r.url.queryParameters['after'] == null ? 'a' : 'b')],
        'nextCursor': r.url.queryParameters['after'] == null ? 'a' : null
      });
    }));
    await tester.pumpWidget(MaterialApp(
        home: ProductInventoryScreen(vendorId: 'store-a', api: api)));
    await tester.pumpAndSettle();
    expect(find.textContaining('Milk a'), findsOneWidget);
    expect(find.textContaining('Low stock'), findsOneWidget);
    await tester.tap(find.text('Load more products'));
    await tester.pumpAndSettle();
    expect(paths.last.path, endsWith('/v1/vendors/store-a/products'));
    expect(paths.last.queryParameters['after'], 'a');
    expect(find.textContaining('Milk b'), findsOneWidget);
    expect(find.text('Load more products'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'stock retry reuses its request ID and expected version, preserving an offline adjustment',
      (tester) async {
    final writes = <Map<String, dynamic>>[];
    final api = ProductApi(client: MockClient((r) async {
      if (r.method == 'POST') {
        writes.add(Map<String, dynamic>.from(jsonDecode(r.body)));
        if (writes.length == 1) throw Exception('offline');
        return json({'success': true, 'data': product('a')});
      }
      return json({
        'success': true,
        'data': [product('a')],
        'nextCursor': null
      });
    }));
    await tester.pumpWidget(MaterialApp(
        home: ProductInventoryScreen(vendorId: 'store-a', api: api)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Adjust stock'));
    await tester.pumpAndSettle();
    final dialog = find.byType(AlertDialog);
    await tester.enterText(
        find.descendant(of: dialog, matching: find.byType(TextField)).first,
        '5');
    await tester.enterText(
        find.descendant(of: dialog, matching: find.byType(TextField)).last,
        'Received counted packs');
    await tester.tap(find.text('Save adjustment'));
    await tester.pumpAndSettle();
    expect(find.textContaining('offline'), findsOneWidget);
    await tester.tap(find.text('Save adjustment'));
    await tester.pumpAndSettle();
    expect(writes, hasLength(2));
    expect(writes.first, writes.last);
    expect(writes.first['expectedVersion'], 7);
    expect(writes.first['delta'], 5);
    expect(find.byType(AlertDialog), findsNothing);
    expect(tester.takeException(), isNull);
  });
  test(
      'product write errors preserve the server reason and do not report success',
      () async {
    final api = ProductApi(
        client: MockClient((_) async => json({
              'success': false,
              'code': 'ALREADY_EXISTS',
              'message': 'This SKU already exists.'
            }, 409)));
    await expectLater(
        api.call('POST', '/v1/vendors/store-a/products', {'sku': 'MILK-A'}),
        throwsA(predicate((e) => '$e'.contains('This SKU already exists.'))));
  });
}
