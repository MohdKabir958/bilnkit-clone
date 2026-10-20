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
import 'package:vendor_app/services/product_api.dart';
import 'package:vendor_app/services/partner_auth_service.dart';
import 'package:vendor_app/models/dish_model.dart';
import 'package:vendor_app/models/order_model.dart';
import '../../../packages/kraveo_ui/test_support/visual_capture.dart';
import 'support/fakes.dart';

class VisualProductApi extends ProductApi {
  final products = [
    for (var i = 0; i < 5; i++)
      {
        'id': 'sku-$i',
        'vendorId': 'visual-store',
        'name': [
          'Toned milk',
          'Whole wheat flour',
          'Farm eggs',
          'Rolled oats',
          'Robusta bananas'
        ][i],
        'sku': 'GRO-$i',
        'unit': 'g',
        'packSize': '500',
        'pricePaise': 3200 + i * 1000,
        'mrpPaise': 4000 + i * 1000,
        'stockQty': i == 0 ? 3 : 18,
        'stockVersion': 1,
        'lowStock': i == 0,
        'lowStockThreshold': 5,
        'active': true,
        'categoryId': 'dairy',
        'description': 'Test fixture product',
        'approvalStatus': 'APPROVED',
        'imageUrls': <String>[]
      }
  ];
  @override
  Future<Map<String, dynamic>> call(String method, String path,
          [Map<String, dynamic>? body]) async =>
      {
        'success': true,
        'data': path.contains('categories')
            ? [
                {'id': 'dairy', 'name': 'Dairy'}
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
            ..['dropoffHostel'] = 'Indiranagar'
            ..['dropoffNotes'] = null
            ..['customer'] = {
              'id': 'visual-customer',
              'name': 'Meera',
              'phone': null,
              'hostelBlock': 'Indiranagar'
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
    controller.dispose();
  }, skip: !captureEnabled);
}
