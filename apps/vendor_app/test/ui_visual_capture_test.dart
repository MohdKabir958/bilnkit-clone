// Real production screens; all service data below is an isolated widget-test fixture.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import 'package:vendor_app/screens/login_screen.dart';
import 'package:vendor_app/screens/vendor_home.dart';
import 'package:vendor_app/screens/product_inventory_screen.dart';
import 'package:vendor_app/screens/kitchen_queue.dart';
import 'package:vendor_app/screens/sales_analytics.dart';
import 'package:vendor_app/screens/preparation_settings_screen.dart';
import 'package:vendor_app/screens/store_performance_screen.dart';
import 'package:vendor_app/services/product_api.dart';
import 'package:vendor_app/services/partner_auth_service.dart';
import 'package:vendor_app/models/dish_model.dart';
import 'package:vendor_app/models/order_model.dart';
import '../../../packages/kraveo_ui/test_support/visual_capture.dart';
import '../../../packages/kraveo_ui/test_support/demo_images.dart';
import 'support/fakes.dart';

class VisualProductApi extends ProductApi {
  VisualProductApi({this.lowStockExample = false});
  final bool lowStockExample;
  List<Map<String, dynamic>> get products => [
        for (final raw in demoScenario['products'])
          {
            'id': 'sku-${raw['id']}',
            'vendorId': 'visual-store',
            'name': raw['name'],
            'sku': 'DEMO-1-${raw['id'].toString().toUpperCase()}',
            'unit': raw['unit'],
            'packSize': raw['packSize'],
            'pricePaise': raw['pricePaise'],
            'mrpPaise': raw['mrpPaise'],
            'stockQty':
                lowStockExample && raw['id'] == 'milk' ? 3 : raw['stockQty'],
            'stockVersion': 1,
            'lowStock':
                lowStockExample && raw['id'] == 'milk' || raw['stockQty'] == 0,
            'lowStockThreshold': 5,
            'active': raw['stockQty'] > 0,
            'categoryId': raw['category'],
            'description': 'Explicit synthetic demonstration product',
            'approvalStatus': 'APPROVED',
            'imageUrls': [demoImageUrl(raw['id'])]
          }
      ];
  @override
  Future<Map<String, dynamic>> call(String method, String path,
          [Map<String, dynamic>? body]) async =>
      {
        'success': true,
        'data': path.endsWith('/preparation')
            ? {
                'preparationMinutes': 12,
                'maxPreparingOrders': 4,
                'busyUntil': null,
                'operatingHours': [
                  {'day': 1, 'opens': 480, 'closes': 1260},
                  {'day': 2, 'opens': 480, 'closes': 1260}
                ]
              }
            : path.contains('/performance')
                ? {
                    'orders': 24,
                    'delivered': 21,
                    'cancelled': 3,
                    'averagePackingMinutes': 11.4,
                    'stockEvents': [
                      {'kind': 'MISSING', 'events': 2}
                    ],
                    'lowStock': [
                      {
                        'name': 'Toned milk',
                        'stockQty': 3,
                        'lowStockThreshold': 5
                      }
                    ]
                  }
                : path.contains('categories')
                    ? [
                        for (final name in (demoScenario['products'] as List)
                            .map((p) => p['category'])
                            .toSet())
                          {'id': name, 'name': name}
                      ]
                    : products,
        'nextCursor': null
      };
}

void main() {
  setUpAll(loadVisualFonts);
  testWidgets(
      'capture vendor production screens with isolated service fixtures',
      (tester) async {
    await prepareVisual(tester);
    final restoreImages = installDemoImageTransport();
    SharedPreferences.setMockInitialValues({});
    OrderModel visualOrder(String id, String status, {bool milk = true}) {
      final subtotal = milk ? 64.0 : 62.0;
      final data =
          orderJson(id: id, status: status, total: subtotal + 40, items: [
        {
          'id': 'line-$id',
          'menuItemId': milk ? 'sku-0' : 'sku-1',
          'name': milk ? 'Toned milk 500 ml' : 'Whole wheat flour 1 kg',
          'quantity': milk ? 2 : 1,
          'price': milk ? 32.0 : 62.0,
        }
      ])
            ..['subtotal'] = subtotal
            ..['dropoffHostel'] = 'Demo Unit C01 · Town Hall area'
            ..['dropoffNotes'] = null
            ..['customer'] = {
              'id': 'visual-customer',
              'name': 'Meera',
              'phone': null,
              'hostelBlock': 'Demo Unit C01 · Town Hall area'
            };
      return OrderModel.fromJson(data)!;
    }

    final backend = FakeBackend()
      ..menu = [
        DishModel(id: 'sku-0', name: 'Toned milk', category: 'Dairy', price: 32)
      ]
      ..put(visualOrder('visual-301', 'PREPARING'))
      ..put(visualOrder('visual-302', 'READY_FOR_PICKUP', milk: false));
    Widget host(Widget child) => captureRoot(MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: KraveoTheme.vendor(),
        home: child));
    Future<void> show(Widget child, String name) async {
      await tester.pumpWidget(host(child));
      await captureVisual(tester, 'vendor', name);
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 6));
    }

    await show(
        LoginScreen(
            onSubmit: (_, __) async =>
                const LoginResult.failure(LoginFailure.server)),
        'login');
    await show(
        VendorHomeScreen(
            productApi: VisualProductApi(),
            backend: backend,
            vendorId: 'visual-store',
            socketFactory: FakeSocket.new,
            alarm: FakeAlarm()),
        'dashboard');
    final productApi = VisualProductApi();
    await show(
        ProductInventoryScreen(vendorId: 'visual-store', api: productApi),
        'products');
    await show(ProductEditor(vendorId: 'visual-store', api: productApi),
        'add-product');
    await show(
        ProductInventoryScreen(vendorId: 'visual-store', api: productApi),
        'inventory');
    final controller = await startController(backend);
    await show(
        Scaffold(body: KitchenQueueScreen(controller: controller)), 'orders');
    await show(
        Scaffold(
            body: SalesAnalyticsScreen(orders: backend.server.values.toList())),
        'sales');
    await show(
        PreparationSettingsScreen(vendorId: 'visual-store', api: productApi),
        'packing-and-hours');
    await show(
        StorePerformanceScreen(vendorId: 'visual-store', api: productApi),
        'store-performance');
    controller.dispose();
    restoreImages();
  }, skip: !captureEnabled);
}
