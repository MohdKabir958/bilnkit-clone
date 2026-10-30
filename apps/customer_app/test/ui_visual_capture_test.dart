// Screenshots render real production widgets with explicitly isolated test fixtures.
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import 'package:customer_app/models/dhaba.dart';
import 'package:customer_app/models/delivery_address.dart';
import 'package:customer_app/models/order_group.dart';
import 'package:customer_app/models/menu_item.dart';
import 'package:customer_app/models/order.dart';
import 'package:customer_app/services/order_api.dart';
import 'package:customer_app/providers/cart_provider.dart';
import 'package:customer_app/providers/dhaba_provider.dart';
import 'package:customer_app/providers/order_provider.dart';
import 'package:customer_app/providers/session_provider.dart';
import 'package:customer_app/screens/auth_screen.dart';
import 'package:customer_app/screens/home_screen.dart';
import 'package:customer_app/screens/dhaba_menu_screen.dart';
import 'package:customer_app/screens/checkout_screen.dart';
import 'package:customer_app/screens/live_tracking_screen.dart';
import 'package:customer_app/widgets/cart_sheet.dart';
import 'package:customer_app/widgets/product_details.dart';
import 'package:customer_app/widgets/product_card.dart';
import '../../../packages/kraveo_ui/test_support/visual_capture.dart';
import '../../../packages/kraveo_ui/test_support/demo_images.dart';
import 'support/order_fakes.dart';

final visualStore = Dhaba(
    id: '${demoScenario['namespace']}-store-1',
    name: demoScenario['stores'][0]['name'],
    primaryCategoryId: 'demo-store-category',
    publicPhone: '+919000000001',
    description:
        'Explicitly simulated grocery store. No real merchant affiliation.',
    category: 'Grocery stores',
    rating: 0,
    eta: '',
    bannerUrl: '',
    isAcceptingOrders: true,
    address: 'Simulated pickup — K.R. Market area, Bengaluru 560002',
    deliveryFee: 25,
    minOrder: 0);
final visualProducts = [
  for (final (id, name, category, unit, pack, price, stock) in [
    ('milk', 'Toned milk', 'Dairy', 'ml', '500', 32.0, 18),
    ('bananas', 'Robusta bananas', 'Fruit & vegetables', 'g', '500', 45.0, 12),
    ('flour', 'Whole wheat flour', 'Staples', 'kg', '1', 62.0, 8),
    ('eggs', 'Farm eggs', 'Dairy', 'pcs', '6', 55.0, 4),
    ('tomatoes', 'Fresh tomatoes', 'Fruit & vegetables', 'g', '500', 28.0, 0),
    ('rice', 'Long grain rice', 'Staples', 'kg', '1', 85.0, 9),
  ])
    MenuItemModel(
        id: id,
        vendorId: visualStore.id,
        name: name,
        price: price,
        category: category,
        description:
            'Illustrative test product. Product information is supplied by the store.',
        imageUrl: demoImageUrl(id),
        isAvailable: stock > 0,
        sku: id.toUpperCase(),
        unit: unit,
        packSize: pack,
        stockQty: stock,
        mrpPaise: ((price + 8) * 100).round()),
];

void main() {
  setUpAll(loadVisualFonts);
  testWidgets(
      'capture customer production screens using isolated grocery fixtures',
      (tester) async {
    await prepareVisual(tester);
    final restoreImages = installDemoImageTransport();
    SharedPreferences.setMockInitialValues({});
    final quoteFixture =
        jsonDecode(File('../../demo/capture-quote.json').readAsStringSync())
            as Map<String, dynamic>;
    final address = DeliveryAddress(
        Map<String, dynamic>.from(quoteFixture['address'] as Map));
    final session = SessionProvider(initial: SessionStatus.checking)
      ..beginForTest({
        'id': address.customerId,
        'name': 'Aarav Sharma',
        'role': 'STUDENT',
        'isStudent': true,
        'avatarId': 2
      });
    session.selectDeliveryAddress(address);
    final catalog = DhabaProvider(
        dhabas: [visualStore], menus: {visualStore.id: visualProducts});
    final cart = CartProvider();
    final api = FakeOrderApi();
    api.onQuote = (_) async => OrderResult.ok(OrderQuote.tryParse({
          ...Map<String, dynamic>.from(quoteFixture['quote'] as Map),
          'maxRestaurants': 1,
          'paymentMethods': ['ONLINE', 'COD'],
          'capacity': {
            'estimatedDeliveryMinMinutes': 30,
            'estimatedDeliveryMaxMinutes': 45,
            'message': 'Nearby delivery partners available.'
          }
        })!);
    final orders = fakeOrders(api);
    Widget host(Widget child) => captureRoot(MultiProvider(
            providers: [
              ChangeNotifierProvider<SessionProvider>.value(value: session),
              ChangeNotifierProvider<DhabaProvider>.value(value: catalog),
              ChangeNotifierProvider<CartProvider>.value(value: cart),
              ChangeNotifierProvider<OrderProvider>.value(value: orders),
            ],
            child: MaterialApp(
                debugShowCheckedModeBanner: false,
                theme: KraveoTheme.customer(),
                home: child)));
    Future<void> show(Widget child, String name) async {
      await tester.pumpWidget(host(child));
      await captureVisual(tester, 'customer', name);
      if (name == 'home') {
        expect(
            tester
                .widgetList<RawImage>(find.descendant(
                    of: find.byType(ProductCard),
                    matching: find.byType(RawImage)))
                .any((image) => image.image != null),
            isTrue,
            reason:
                'Demo grocery photos must decode before screenshot evidence.');
      }
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
    }

    await show(const AuthScreen(), 'login');
    await show(const HomeScreen(), 'home');
    await show(DhabaMenuScreen(dhaba: visualStore, selectedHostel: null),
        'categories');
    await tester.pumpWidget(host(Builder(
        builder: (ctx) => Scaffold(
            body: TextButton(
                onPressed: () => showProductDetails(
                    ctx, visualProducts.first, visualProducts),
                child: const Text('Open'))))));
    await tester.tap(find.text('Open'));
    await captureVisual(tester, 'customer', 'product-details');
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    cart.addItem(
        item: visualProducts.first,
        dhabaId: visualStore.id,
        dhabaName: visualStore.name);
    cart.addItem(
        item: visualProducts[1],
        dhabaId: visualStore.id,
        dhabaName: visualStore.name);
    await show(
        Scaffold(body: CartSheet(selectedHostel: address.formatted)), 'cart');
    await show(const CheckoutScreen(selectedHostel: null), 'checkout');
    final tracking = OrderModel.tryParse(orderJson(
        status: 'PREPARING',
        paymentStatus: 'PAID',
        vendorId: visualStore.id,
        vendorName: visualStore.name,
        dropoffHostel: address.formatted,
        dropoffNotes: 'Synthetic demo delivery address',
        items: [
          {
            'id': 'i1',
            'menuItemId': 'milk',
            'name': 'Toned milk',
            'quantity': 1,
            'price': 32.0
          }
        ]))!;
    api.server[tracking.id] = tracking;
    api.onFetchList = (scope, cursor) async =>
        OrderResult.ok(OrdersPage(scope == 'history' ? [] : [tracking], null));
    orders.beginSession(address.customerId);
    await orders.refreshActive();
    await show(const LiveTrackingScreen(visible: true), 'tracking');
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 6));
    orders.dispose();
    catalog.dispose();
    cart.dispose();
    session.dispose();
    restoreImages();
  }, skip: !captureEnabled);
}
