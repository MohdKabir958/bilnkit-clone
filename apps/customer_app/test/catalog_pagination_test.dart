import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:customer_app/providers/dhaba_provider.dart';
import 'package:customer_app/services/customer_api_service.dart';

Map<String, dynamic> product(String id, [String? name]) => {
      'id': id,
      'vendorId': 'store',
      'name': name ?? 'Product $id',
      'price': 32.5,
      'category': 'Dairy',
      'sku': id,
      'unit': 'ml',
      'packSize': '500',
      'stockQty': 2,
      'isAvailable': true
    };
http.Response page(List<Map<String, dynamic>> data, {String? after}) =>
    http.Response(
        jsonEncode({'success': true, 'data': data, 'nextCursor': after}), 200);
http.Response catalog() => page([
      {
        'id': 'store',
        'name': 'Local Market',
        'category': 'Groceries',
        'isAcceptingOrders': true,
        'hasMoreProducts': true,
        'menuItems': [product('first')]
      }
    ]);
void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await CustomerApiService.saveToken('isolated-test-token');
    CustomerApiService.selectedAddressId = 'address';
  });
  tearDown(() {
    CustomerApiService.httpClientOverride = null;
    CustomerApiService.selectedAddressId = null;
  });
  test(
      'initial discovery paints first products without hydrating every product page',
      () async {
    final calls = <Uri>[];
    CustomerApiService.httpClientOverride = MockClient((r) async {
      calls.add(r.url);
      return r.url.path.endsWith('/nearby')
          ? catalog()
          : page([product('second')]);
    });
    final provider = DhabaProvider();
    addTearDown(provider.dispose);
    expect(await provider.loadCatalog(), isTrue);
    expect(calls.where((u) => u.path.endsWith('/products')), isEmpty);
    expect(provider.getMenuItemsForDhaba('store').map((p) => p.id), ['first']);
    expect(provider.hasMoreProducts('store'), isTrue);
    expect(await provider.loadProductPage('store'), isTrue);
    expect(calls.last.queryParameters['after'], 'first');
    expect(calls.last.queryParameters['addressId'], 'address');
    expect(provider.getMenuItemsForDhaba('store').map((p) => p.id),
        ['first', 'second']);
    expect(provider.hasMoreProducts('store'), isFalse);
  });
  test('a late product page from a previous address cannot reappear', () async {
    final response = Completer<http.Response>();
    CustomerApiService.httpClientOverride = MockClient((r) async =>
        r.url.path.endsWith('/nearby') ? catalog() : await response.future);
    final provider = DhabaProvider();
    addTearDown(provider.dispose);
    await provider.loadCatalog();
    final pending = provider.loadProductPage('store');
    provider.resetForAddress();
    response.complete(page([product('old-private-stock')]));
    expect(await pending, isFalse);
    expect(provider.allDhabas, isEmpty);
    expect(provider.getMenuItemsForDhaba('store'), isEmpty);
  });
  test(
      'debounced search finds a real SKU outside the initially loaded products',
      () async {
    final queries = <String>[];
    CustomerApiService.httpClientOverride = MockClient((r) async {
      if (r.url.path.endsWith('/nearby')) return catalog();
      queries.add(r.url.queryParameters['q'] ?? '');
      return page([product('rice-sku', 'Basmati rice')]);
    });
    final provider = DhabaProvider();
    addTearDown(provider.dispose);
    await provider.loadCatalog();
    final found = Completer<void>();
    provider.addListener(() {
      if (provider.homeProducts('store').any((p) => p.id == 'rice-sku') &&
          !found.isCompleted) {
        found.complete();
      }
    });
    provider.setSearchQuery('r');
    provider.setSearchQuery('ri');
    provider.setSearchQuery('rice');
    await found.future.timeout(const Duration(seconds: 5));
    expect(queries, ['rice']);
    expect(provider.dhabas.single.id, 'store');
    expect(provider.homeProducts('store').single.name, 'Basmati rice');
  });
}
