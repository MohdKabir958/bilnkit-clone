import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:customer_app/models/menu_item.dart';
import 'package:customer_app/services/customer_api_service.dart';
import 'package:customer_app/widgets/product_details.dart';

void main() {
  tearDown(() {
    CustomerApiService.httpClientOverride = null;
  });
  test(
      'nearby discovery follows the product cursor past the original first 50 rows',
      () async {
    SharedPreferences.setMockInitialValues({});
    await CustomerApiService.saveToken('customer-test-token');
    CustomerApiService.selectedAddressId = 'my-address';
    final calls = <Uri>[];
    CustomerApiService.httpClientOverride = MockClient((r) async {
      calls.add(r.url);
      expect(r.headers['authorization'], 'Bearer customer-test-token');
      expect(r.url.queryParameters['addressId'], 'my-address');
      if (r.url.path.endsWith('/nearby')) {
        return http.Response(
            jsonEncode({
              'success': true,
              'data': [
                {
                  'id': 'store-a',
                  'hasMoreProducts': true,
                  'menuItems': List.generate(50, (i) => {'id': 'pack-$i'})
                }
              ],
              'nextCursor': null
            }),
            200);
      }
      expect(r.url.path, endsWith('/v1/vendors/store-a/products'));
      expect(r.url.queryParameters['after'], 'pack-49');
      return http.Response(
          jsonEncode({
            'success': true,
            'data': [
              {'id': 'pack-50'}
            ],
            'nextCursor': null
          }),
          200);
    });
    final result = await CustomerApiService.fetchVendors();
    expect((result.single['menuItems'] as List).length, 51);
    expect(calls.length, 2);
  });
  testWidgets(
      'product details select a real pack, preserve paise and disable unavailable variants',
      (tester) async {
    final small = MenuItemModel.fromJson({
      'id': 'small',
      'vendorId': 'store',
      'name': 'Milk',
      'price': 65.45,
      'category': 'Dairy',
      'sku': 'MILK-500',
      'productKey': 'milk',
      'unit': 'ml',
      'packSize': '500',
      'stockQty': 2,
      'mrpPaise': 7000,
      'isAvailable': true
    });
    final large = MenuItemModel.fromJson({
      'id': 'large',
      'vendorId': 'store',
      'name': 'Milk',
      'price': 125,
      'category': 'Dairy',
      'sku': 'MILK-1000',
      'productKey': 'milk',
      'unit': 'ml',
      'packSize': '1000',
      'stockQty': 0,
      'isAvailable': false
    });
    (MenuItemModel, int)? result;
    await tester.pumpWidget(MaterialApp(
        home: Builder(
            builder: (c) => Scaffold(
                body: TextButton(
                    onPressed: () async => result =
                        await showProductDetails(c, small, [small, large]),
                    child: const Text('Product'))))));
    await tester.tap(find.text('Product'));
    await tester.pumpAndSettle();
    expect(find.textContaining('MRP ₹70 · Save ₹4.55'), findsOneWidget);
    await tester.tap(find.byTooltip('More packs'));
    await tester.pumpAndSettle();
    expect(find.text('Add 2 · ₹130.90'), findsOneWidget);
    await tester.tap(find.byTooltip('More packs'));
    await tester.pumpAndSettle();
    expect(find.text('Add 2 · ₹130.90'), findsOneWidget);
    await tester.tap(find.textContaining('1000 ml · ₹125'));
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull);
    await tester.tap(find.textContaining('500 ml · ₹65.45'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add 1 · ₹65.45'));
    await tester.pumpAndSettle();
    expect(result?.$1.id, 'small');
    expect(result?.$2, 1);
    expect(tester.takeException(), isNull);
  });
}
