import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:customer_app/models/delivery_address.dart';
import 'package:customer_app/screens/addresses_screen.dart';
import 'package:customer_app/services/address_api.dart';
import 'package:customer_app/services/customer_api_service.dart';
import 'package:customer_app/services/order_api.dart';
import 'package:customer_app/models/order_group.dart';

Map<String, dynamic> saved({String id = 'address-a', bool isDefault = true}) =>
    {
      'id': id,
      'customerId': 'customer-a',
      'cityId': 'blr',
      'city': {'id': 'blr', 'name': 'Bengaluru', 'state': 'Karnataka'},
      'label': 'Home',
      'houseNumber': 'Flat 14',
      'street': 'Main Road',
      'locality': 'Central',
      'pinCode': '560001',
      'country': 'IN',
      'lat': 12.97,
      'lng': 77.59,
      'isDefault': isDefault
    };
http.Response json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status,
        headers: {'content-type': 'application/json'});
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await CustomerApiService.saveToken('test-only-jwt');
  });
  tearDown(() async {
    CustomerApiService.httpClientOverride = null;
    await CustomerApiService.clearToken();
  });
  test('address lists follow cursors and keep separate saved addresses',
      () async {
    CustomerApiService.httpClientOverride = MockClient((r) async {
      expect(r.headers['authorization'], 'Bearer test-only-jwt');
      expect(r.url.path, endsWith('/v1/addresses'));
      return json({
        'success': true,
        'data': [saved(id: r.url.queryParameters['after'] == null ? 'a' : 'b')],
        'nextCursor': r.url.queryParameters['after'] == null ? 'a' : null
      });
    });
    expect((await AddressApi.list()).map((a) => a.id), ['a', 'b']);
  });
  test(
      'selecting an address writes real JSON through PUT, without double encoding',
      () async {
    CustomerApiService.httpClientOverride = MockClient((r) async {
      expect(r.method, 'PUT');
      expect(r.url.path, endsWith('/v1/addresses/address-a'));
      final body = jsonDecode(r.body) as Map;
      expect(body['pinCode'], '560001');
      expect(body['lat'], isA<num>());
      expect(body['isDefault'], true);
      return json({'success': true, 'data': saved()});
    });
    final a = DeliveryAddress(saved());
    expect(
        (await AddressApi.save(a.toWrite(isDefault: true), id: a.id)).formatted,
        contains('Bengaluru 560001'));
  });
  test(
      'a quote includes the selected address and preserves the server’s unsupported-area error',
      () async {
    CustomerApiService.selectedAddressId = 'address-a';
    CustomerApiService.httpClientOverride = MockClient((r) async {
      expect(r.url.path, endsWith('/v1/orders/quote'));
      expect((jsonDecode(r.body) as Map)['addressId'], 'address-a');
      return json({
        'success': false,
        'code': 'AREA_UNSUPPORTED',
        'message': 'This store does not deliver here.'
      }, 409);
    });
    final result =
        await const HttpOrderApi().quote(const QuoteRequest(restaurants: [
      RestaurantCart(
          vendorId: 'store-a', items: [(itemId: 'milk', quantity: 1)])
    ], addressId: 'address-a'));
    expect(result.error?.code, 'AREA_UNSUPPORTED');
    expect(result.error?.message, 'This store does not deliver here.');
  });
  testWidgets(
      'the saved-address picker selects the server’s address and shows its complete label',
      (tester) async {
    DeliveryAddress? selected;
    CustomerApiService.httpClientOverride = MockClient((r) async {
      if (r.method == 'PUT') return json({'success': true, 'data': saved()});
      return json({
        'success': true,
        'data': [saved()],
        'nextCursor': null
      });
    });
    await tester.pumpWidget(MaterialApp(
        home: Builder(
            builder: (c) => Scaffold(
                body: TextButton(
                    onPressed: () async {
                      selected = await Navigator.push<DeliveryAddress>(
                          c,
                          MaterialPageRoute(
                              builder: (_) => const AddressesScreen()));
                    },
                    child: const Text('Choose address'))))));
    await tester.tap(find.text('Choose address'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Flat 14, Main Road, Central, Bengaluru 560001'),
        findsOneWidget);
    await tester.tap(find.text('Home · Selected'));
    await tester.pumpAndSettle();
    expect(selected?.id, 'address-a');
    expect(tester.takeException(), isNull);
  });
}
