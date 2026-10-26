import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vendor_app/screens/preparation_settings_screen.dart';
import 'package:vendor_app/screens/store_performance_screen.dart';
import 'package:vendor_app/services/product_api.dart';
import 'package:vendor_app/services/vendor_api_service.dart';

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await VendorApiService.saveToken('owned-store-test');
  });
  tearDown(() async {
    await VendorApiService.clearToken();
  });
  testWidgets(
      'weekly schedule preserves configured India hours when saving packing policy',
      (tester) async {
    final saved = <Map<String, dynamic>>[];
    final state = {
      'preparationMinutes': 12,
      'maxPreparingOrders': 4,
      'busyUntil': null,
      'operatingHours': [
        {'day': 1, 'opens': 480, 'closes': 1260}
      ]
    };
    final api = ProductApi(client: MockClient((request) async {
      expect(request.headers['authorization'], 'Bearer owned-store-test');
      expect(request.url.path, '/api/v1/partner/stores/owned/preparation');
      if (request.method == 'PUT') {
        saved.add(Map<String, dynamic>.from(jsonDecode(request.body)));
      }
      return http.Response(jsonEncode({'success': true, 'data': state}), 200);
    }));
    await tester.pumpWidget(MaterialApp(
        home: PreparationSettingsScreen(vendorId: 'owned', api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Weekly opening hours'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Save packing policy'), 400,
        maxScrolls: 20, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Save packing policy'));
    await tester.pumpAndSettle();
    expect(saved.single['operatingHours'], state['operatingHours']);
    expect(saved.single['preparationMinutes'], 12);
    expect(tester.takeException(), isNull);
  });
  testWidgets('owned store report shows actual preparation and low-stock data',
      (tester) async {
    final api = ProductApi(client: MockClient((request) async {
      expect(request.url.path, '/api/v1/partner/stores/owned/performance');
      expect(request.url.queryParameters['days'], '30');
      return http.Response(
          jsonEncode({
            'success': true,
            'data': {
              'orders': 9,
              'delivered': 7,
              'cancelled': 2,
              'averagePackingMinutes': 12.5,
              'stockEvents': [
                {'kind': 'MISSING', 'events': 2}
              ],
              'lowStock': [
                {'name': 'Fresh milk', 'stockQty': 2, 'lowStockThreshold': 5}
              ]
            }
          }),
          200);
    }));
    await tester.pumpWidget(
        MaterialApp(home: StorePerformanceScreen(vendorId: 'owned', api: api)));
    await tester.pumpAndSettle();
    expect(find.text('12.5 min'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Fresh milk'), 250);
    expect(find.text('2 left'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
