// Actual production widgets; rendering fixtures cannot authenticate or alter production data.
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import 'package:provider/provider.dart';
import 'package:customer_app/models/dhaba.dart';
import 'package:customer_app/models/delivery_address.dart';
import 'package:customer_app/models/menu_item.dart';
import 'package:customer_app/providers/cart_provider.dart';
import 'package:customer_app/providers/dhaba_provider.dart';
import 'package:customer_app/providers/order_provider.dart';
import 'package:customer_app/providers/session_provider.dart';
import 'package:customer_app/screens/home_screen.dart';
import 'package:customer_app/screens/grocery_browse_screen.dart';
import 'package:customer_app/models/grocery_department.dart';
import 'package:customer_app/services/customer_api_service.dart';
import 'package:customer_app/widgets/grocery_home_components.dart';
import '../../../packages/kraveo_ui/test_support/visual_capture.dart';
import '../../../packages/kraveo_ui/test_support/demo_images.dart';
import 'support/order_fakes.dart';

class ReferenceFixtureCatalog extends DhabaProvider {
  ReferenceFixtureCatalog()
      : super(dhabas: [
          for (final (i, name) in [
            'Grozo Demo Market One',
            'Grozo Demo Market Two',
            'FreshMart',
            'Green Grocers'
          ].indexed)
            Dhaba(
                id: 'store-$i',
                name: name,
                category: 'Grocery stores',
                rating: 0,
                eta: '',
                bannerUrl: '',
                isAcceptingOrders: true,
                address: 'Explicitly simulated demonstration pickup',
                primaryCategoryId: 'groceries',
                distanceKm: [.8, 3.0, 4.2, 5.6][i])
        ], menus: {
          'store-0': [
            product(
                'milk', 'Fresh Cow Milk', 'Dairy', '1', 'L', 45, 55, 'store-0'),
            product('bananas', 'Banana', 'Fruit & vegetables', '1', 'kg', 34,
                40, 'store-0')
          ],
          'store-1': [
            product('tea', 'Black tea leaves', 'Beverages', '250', 'g', 120,
                135, 'store-1'),
            product('tomatoes', 'Tomatoes', 'Fruit & vegetables', '500', 'g',
                28, 35, 'store-1')
          ]
        });
  @override
  Future<bool> refreshHome() async => true;
  @override
  Future<void> loadCategories() async {}
}

MenuItemModel product(String id, String name, String category, String size,
        String unit, double price, double mrp, String store) =>
    MenuItemModel(
        id: id,
        vendorId: store,
        name: name,
        price: price,
        category: category,
        packSize: size,
        unit: unit,
        mrpPaise: (mrp * 100).round(),
        stockQty: 20,
        isAvailable: true,
        imageUrl: demoImageUrl(id),
        description:
            'Synthetic rendering fixture. Original unbranded demonstration image.');

void main() {
  setUpAll(loadVisualFonts);
  late ReferenceFixtureCatalog catalog;
  late SessionProvider session;
  late CartProvider cart;
  late OrderProvider orders;
  setUp(() {
    catalog = ReferenceFixtureCatalog();
    cart = CartProvider();
    orders = fakeOrders(FakeOrderApi());
    session = SessionProvider(initial: SessionStatus.checking)
      ..beginForTest({
        'id': 'reference-customer',
        'name': 'Synthetic Customer',
        'role': 'STUDENT',
        'isStudent': true
      });
    final raw =
        jsonDecode(File('../../demo/capture-quote.json').readAsStringSync())
            as Map;
    session.selectDeliveryAddress(DeliveryAddress({
      ...Map<String, dynamic>.from(raw['address']),
      'customerId': 'reference-customer',
      'houseNumber': 'Lal bihara',
      'street': 'bamnauli',
      'locality': 'bamrauli',
      'label': 'Demo'
    }));
  });
  tearDown(() {
    catalog.dispose();
    session.dispose();
    cart.dispose();
    orders.dispose();
    CustomerApiService.httpClientOverride = null;
  });
  Future<void> host(WidgetTester tester,
      {double width = 390, double height = 844, double scale = 1}) async {
    await prepareVisual(tester, width: width, height: height, scale: scale);
    await tester.pumpWidget(captureRoot(MultiProvider(
        providers: [
          ChangeNotifierProvider<DhabaProvider>.value(value: catalog),
          ChangeNotifierProvider<SessionProvider>.value(value: session),
          ChangeNotifierProvider<CartProvider>.value(value: cart),
          ChangeNotifierProvider<OrderProvider>.value(value: orders)
        ],
        child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: KraveoTheme.customer(),
            home: const HomeScreen()))));
    await tester.pump(const Duration(seconds: 2));
    await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 300)));
    await tester.pump();
  }

  testWidgets(
      'reference structure: green brand, four stores, ten categories and two product columns',
      (tester) async {
    await host(tester);
    expect(find.text('Freshness Delivered'), findsOneWidget);
    expect(find.byType(NearbyStoreTile), findsNWidgets(4));
    expect(find.byType(GroceryCategoryTile), findsNWidgets(10));
    expect(find.text('Everyday essentials,\ncloser to home.'), findsNothing);
    expect(tester.getTopLeft(find.text('Nearby Stores')).dy,
        lessThan(tester.getTopLeft(find.text('Shop by Category')).dy));
    expect(tester.getTopLeft(find.text('Shop by Category')).dy,
        lessThan(tester.getTopLeft(find.text('Popular Products')).dy));
    expect(find.text('Best Choice'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
      'product hearts and header wishlist work and clear on account logout',
      (tester) async {
    await host(tester);
    await tester.ensureVisible(find.byTooltip('Save Fresh Cow Milk'));
    await tester.tap(find.byTooltip('Save Fresh Cow Milk'));
    await tester.pump();
    expect(catalog.isProductSaved('milk'), isTrue);
    await tester.ensureVisible(find.byTooltip('Saved stores and products'));
    await tester.pump();
    await tester.tap(find.byTooltip('Saved stores and products'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Your favourites'), findsOneWidget);
    expect(find.text('Fresh Cow Milk'), findsWidgets);
    expect(
        find.descendant(
            of: find.byType(GrocerySavedScreen),
            matching: find.text('Black tea leaves')),
        findsNothing);
    catalog.resetForLogout();
    expect(catalog.isProductSaved('milk'), isFalse);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
      'cart header opens the existing empty cart and View All opens live stores',
      (tester) async {
    await host(tester);
    await tester.tap(find.byTooltip('Open cart'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Your cart is empty'), findsOneWidget);
    Navigator.of(tester.element(find.text('Your cart is empty'))).pop();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.byKey(const ValueKey('all-nearby-stores')));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Grozo Demo Market One'), findsWidgets);
    expect(find.text('All'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
  for (final (width, scale) in [(320.0, 1.0), (390.0, 1.8), (600.0, 1.0)]) {
    testWidgets(
        'reference remains scrollable without overflow at $width / $scale text',
        (tester) async {
      await host(tester, width: width, scale: scale);
      await tester.drag(
          find.byType(CustomScrollView).first, const Offset(0, -450));
      await tester.pump();
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }
  test('department mapping groups live categories without inventing products',
      () {
    expect(GroceryDepartment.all[0].includes('Fruit & vegetables'), isTrue);
    expect(GroceryDepartment.all[1].includes('Dairy'), isTrue);
    expect(GroceryDepartment.all.last.includes('Uncategorized'), isTrue);
    expect(GroceryDepartment.all.last.includes('Dairy'), isFalse);
  });
  testWidgets(
      'reference ADD button uses the real single-store cart and updates the header',
      (tester) async {
    await host(tester);
    final button = find.byWidgetPredicate((widget) =>
        widget is Semantics && widget.properties.label == 'Add Fresh Cow Milk');
    await tester.ensureVisible(button);
    await tester.pump();
    await tester.tap(button);
    await tester.pump();
    expect(cart.getItemQuantityInCart('milk'), 1);
    expect(cart.subtotal, 45);
    await tester.ensureVisible(find.byTooltip('Open cart'));
    await tester.pump();
    await tester.tap(find.byTooltip('Open cart'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.textContaining('Fresh Cow Milk'), findsWidgets);
    await tester.pumpWidget(const SizedBox());
  });
  test(
      'category queries preserve the address and pagination on the existing protected API',
      () async {
    SharedPreferences.setMockInitialValues({});
    await CustomerApiService.saveToken('synthetic-reference-token');
    CustomerApiService.selectedAddressId = 'owned-address';
    CustomerApiService.httpClientOverride = MockClient((request) async {
      expect(
          request.url.queryParameters, containsPair('categoryId', 'dairy-id'));
      expect(request.url.queryParameters, containsPair('after', 'page-one'));
      expect(request.url.queryParameters,
          containsPair('addressId', 'owned-address'));
      return http.Response(
          jsonEncode({'success': true, 'data': [], 'nextCursor': null}), 200);
    });
    await CustomerApiService.fetchProductPage('store-0',
        categoryId: 'dairy-id', after: 'page-one');
  });
  testWidgets('capture actual reference implementation', (tester) async {
    final restoreImages = installDemoImageTransport();
    await host(tester);
    await captureVisual(tester, 'customer', 'home');
    await tester.pumpWidget(const SizedBox());
    await host(tester, height: 1280 * 390 / 630);
    await captureVisual(tester, 'customer', 'home-reference-aspect');
    final boundary =
        captureKey.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    await tester.runAsync(() async {
      final image = await boundary.toImage(pixelRatio: 630 / 390);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      final out =
          File('../../Docs/customer-reference-ui/screenshots/home-630.png');
      await out.parent.create(recursive: true);
      await out.writeAsBytes(bytes!.buffer.asUint8List());
      image.dispose();
    });
    await tester.pumpWidget(const SizedBox());
    restoreImages();
  }, skip: !captureEnabled);
}
