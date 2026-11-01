// Actual Grozo widgets with synthetic API/native fixtures; no hosted account is used.
import 'dart:convert';
import 'package:customer_app/models/delivery_address.dart';
import 'package:customer_app/models/menu_item.dart';
import 'package:customer_app/models/order_group.dart';
import 'package:customer_app/providers/cart_provider.dart';
import 'package:customer_app/providers/dhaba_provider.dart';
import 'package:customer_app/providers/order_provider.dart';
import 'package:customer_app/providers/session_provider.dart';
import 'package:customer_app/screens/checkout_screen.dart';
import 'package:customer_app/screens/home_screen.dart';
import 'package:customer_app/services/customer_api_service.dart';
import 'package:customer_app/services/order_api.dart';
import 'package:customer_app/widgets/grocery_home_components.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../packages/kraveo_ui/test_support/visual_capture.dart';
import '../../../packages/kraveo_ui/test_support/demo_images.dart';
import 'support/order_fakes.dart';

const storeNames = [
  'Grozo Demo Market One · Simulated',
  'Grozo Demo Market Two · Simulated',
];
final address = DeliveryAddress({
  'id': 'layout-address', 'customerId': 'layout-customer',
  'cityId': 'layout-city', 'label': 'Demo · Simulated', 'isDefault': true,
  'houseNumber': 'DEMO Unit C01 (simulated)', 'street': 'Town Hall',
  'locality': 'Town Hall', 'pinCode': '560002', 'country': 'IN',
  'lat': 12.96393155, 'lng': 77.58425661,
  'city': {'name': 'Bengaluru · Demo (simulated)', 'state': 'Karnataka'},
});
Map<String, dynamic> itemJson(String id, String name, double price, String size, String unit) => {
  'id': id, 'vendorId': 'layout-store-1', 'name': name, 'category': 'Groceries',
  'price': price, 'mrpPaise': ((price + 5) * 100).round(), 'packSize': size,
  'unit': unit, 'stockQty': 24, 'isAvailable': true, 'imageUrl': demoImageUrl(id),
};
final products = [
  itemJson('bananas', 'Bananas', 45, '500', 'g'),
  itemJson('biscuits', 'Plain biscuits', 40, '200', 'g'),
  itemJson('bread', 'Sandwich bread', 45, '400', 'g'),
  itemJson('tea', 'Black tea leaves', 120, '250', 'g'),
];
List<Map<String, dynamic>> stores() => [
  for (var i = 0; i < 2; i++) {
    'id': 'layout-store-${i + 1}', 'name': storeNames[i],
    'primaryCategoryId': 'groceries', 'category': 'Grocery stores',
    'isAcceptingOrders': true, 'distanceKm': i == 0 ? 1.0 : 3.0,
    'menuItems': i == 0 ? products : <Map<String, dynamic>>[],
  },
];
OrderQuote quote({bool available = false, bool advertiseOnline = false}) => OrderQuote.tryParse({
  'restaurantCount': 1, 'subtotal': 135, 'total': 134.01,
  'fees': {'base': 26.01, 'total': 26.01}, 'discount': 27,
  'couponCode': 'WELCOME20', 'maxRestaurants': 1, 'perRestaurant': [],
  'paymentMethods': available ? ['ONLINE', 'COD'] : advertiseOnline ? ['ONLINE'] : [],
  'capacity': {
    'canCheckout': available,
    'reason': available ? 'CAPACITY_AVAILABLE' : 'NO_RIDERS_AVAILABLE',
    'message': available ? 'Delivery partners are currently available.' :
        'Delivery is temporarily unavailable. Try again later or choose another store.',
  },
})!;

void main() {
  setUpAll(loadVisualFonts);
  late SessionProvider session;
  late DhabaProvider catalog;
  late CartProvider cart;
  late OrderProvider orders;
  late FakeOrderApi api;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    await CustomerApiService.clearToken();
    await CustomerApiService.saveToken('isolated-layout-fixture');
    CustomerApiService.httpClientOverride = MockClient((request) async {
      final data = request.url.path.endsWith('/vendors/nearby')
          ? stores()
          : request.url.path.endsWith('/addresses') ? [address.data] : [];
      return http.Response(jsonEncode({'success': true, 'data': data}), 200);
    });
    session = SessionProvider(initial: SessionStatus.checking)
      ..beginForTest({'id': 'layout-customer', 'role': 'STUDENT', 'name': 'Synthetic Customer'});
    session.selectDeliveryAddress(address);
    catalog = DhabaProvider();
    cart = CartProvider();
    final item = MenuItemModel.fromJson(products.first);
    for (var i = 0; i < 3; i++) {
      cart.addItem(item: item, dhabaId: 'layout-store-1', dhabaName: storeNames.first);
    }
    expect(cart.applyCoupon('WELCOME20'), isTrue);
    api = FakeOrderApi()..onQuote = (_) async => OrderResult.ok(quote());
    orders = fakeOrders(api);
  });
  tearDown(() async {
    session.dispose(); catalog.dispose(); cart.dispose(); orders.dispose();
    CustomerApiService.httpClientOverride = null;
    await CustomerApiService.clearToken();
  });
  Future<void> host(WidgetTester tester, Widget screen, {double scale = 1, double height = 800}) async {
    await prepareVisual(tester, width: 360, height: height, scale: scale);
    await tester.pumpWidget(captureRoot(MultiProvider(
      providers: [
        ChangeNotifierProvider<SessionProvider>.value(value: session),
        ChangeNotifierProvider<DhabaProvider>.value(value: catalog),
        ChangeNotifierProvider<CartProvider>.value(value: cart),
        ChangeNotifierProvider<OrderProvider>.value(value: orders),
      ],
      child: MaterialApp(debugShowCheckedModeBanner: false,
          theme: KraveoTheme.customer(), home: screen),
    )));
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));
    await tester.pump(const Duration(seconds: 2));
  }
  Future<void> scrollTo(WidgetTester tester, Finder finder) async {
    await tester.scrollUntilVisible(finder, 160,
        scrollable: find.byType(Scrollable).first);
    await tester.ensureVisible(finder);
    await tester.pump(const Duration(seconds: 1));
  }

  test('repeated street/locality is displayed once without changing saved data', () {
    expect(address.formatted, 'DEMO Unit C01 (simulated), Town Hall, Bengaluru · Demo (simulated) 560002');
    expect(address.data['locality'], 'Town Hall');
  });
  for (final scale in [1.0, 1.6, 2.0]) {
    testWidgets('long nearby-store names fit without overlap at text scale $scale', (tester) async {
      await host(tester, const HomeScreen(), scale: scale);
      for (final name in storeNames) {
        final text = find.descendant(of: find.byType(NearbyStoreTile), matching: find.text(name));
        expect(text, findsOneWidget);
        final paragraph = tester.renderObject<RenderParagraph>(text);
        expect(paragraph.didExceedMaxLines, isFalse, reason: name);
      }
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }
  testWidgets('address is last, fully wrapped and smaller, while server pricing is preserved', (tester) async {
    await host(tester, CheckoutScreen(selectedHostel: address.formatted), scale: 1.3, height: 2200);
    await scrollTo(tester, find.byKey(const ValueKey('checkout-address-section')));
    final fullAddress = find.byKey(const ValueKey('checkout-full-address'));
    final addressText = tester.widget<Text>(fullAddress);
    expect(addressText.data, address.formatted);
    expect(addressText.maxLines, isNull);
    expect(addressText.style!.fontSize, lessThanOrEqualTo(14));
    expect(find.text('Delivery address'), findsOneWidget);
    final positions = [
      'checkout-order-section', 'checkout-bill-section',
      'checkout-payment-section', 'checkout-address-section',
    ].map((key) => tester.getTopLeft(find.byKey(ValueKey(key))).dy).toList();
    for (var i = 1; i < positions.length; i++) {
      expect(positions[i], greaterThan(positions[i - 1]));
    }
    final note = tester.widget<TextField>(find.byType(TextField).last);
    expect(note.maxLines, greaterThan(1));
    expect(api.quotes, isNotEmpty);
    expect(api.creates, isEmpty);
    expect(quote().totalPaise, 13401);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
  for (final scale in [1.0, 1.6, 2.0]) {
    testWidgets('full checkout address and instructions fit a small phone at text scale $scale', (tester) async {
      await host(tester, CheckoutScreen(selectedHostel: address.formatted), scale: scale);
      await scrollTo(tester, find.byKey(const ValueKey('checkout-full-address')));
      expect(tester.widget<Text>(find.byKey(const ValueKey('checkout-full-address'))).data, address.formatted);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }
  testWidgets('no-rider reason appears once, refresh rechecks the server and never creates an order', (tester) async {
    await host(tester, CheckoutScreen(selectedHostel: address.formatted));
    expect(find.widgetWithText(KButton, 'Delivery unavailable'), findsOneWidget);
    expect(tester.widget<KButton>(find.widgetWithText(KButton, 'Delivery unavailable')).onPressed, isNull);
    await scrollTo(tester, find.text('Refresh availability'));
    expect(find.textContaining('No delivery partner is available'), findsOneWidget);
    expect(find.textContaining('Delivery is temporarily unavailable.'), findsNothing);
    final before = api.quotes.length;
    api.onQuote = (_) async => OrderResult.ok(quote(available: true));
    await tester.tap(find.text('Refresh availability'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));
    await tester.pump(const Duration(seconds: 2));
    expect(api.quotes.length, before + 1);
    expect(find.text('Delivery unavailable'), findsNothing);
    expect(find.widgetWithText(KButton, 'Pay ₹134.01'), findsOneWidget);
    expect(api.creates, isEmpty);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets('delivery refusal stays authoritative even if a response advertises online payment', (tester) async {
    api.onQuote = (_) async => OrderResult.ok(quote(advertiseOnline: true));
    await host(tester, CheckoutScreen(selectedHostel: address.formatted));
    final button = find.widgetWithText(KButton, 'Delivery unavailable');
    expect(button, findsOneWidget);
    expect(tester.widget<KButton>(button).onPressed, isNull);
    expect(find.text('Pay ₹134.01'), findsNothing);
    expect(api.creates, isEmpty);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets('payment readiness remains separate and cannot invent a cash or online method', (tester) async {
    api.onQuote = (_) async => OrderResult.ok(OrderQuote.tryParse({
      'subtotal': 135, 'total': 134.01, 'discount': 27,
      'paymentMethods': [],
      'capacity': {'canCheckout': true, 'reason': 'CAPACITY_AVAILABLE'},
      'paymentCapabilities': {'message': 'Payment is unavailable for this store. Please try again later.'},
    })!);
    await host(tester, CheckoutScreen(selectedHostel: address.formatted));
    final button = find.widgetWithText(KButton, 'Payment unavailable');
    expect(button, findsOneWidget);
    expect(tester.widget<KButton>(button).onPressed, isNull);
    await scrollTo(tester, find.byKey(const ValueKey('checkout-payment-section')));
    expect(find.text('Payment is unavailable for this store. Please try again later.'), findsOneWidget);
    expect(find.text('Pay online via Razorpay'), findsNothing);
    expect(find.text('Cash on delivery'), findsNothing);
    expect(api.creates, isEmpty);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets('capture updated Home and checkout production widgets with explicit fixtures', (tester) async {
    final restoreImages = installDemoImageTransport();
    try {
      await host(tester, const HomeScreen());
      await captureVisual(tester, 'customer', 'home-layout');
      await tester.pumpWidget(const SizedBox());
      await host(tester, CheckoutScreen(selectedHostel: address.formatted));
      await captureVisual(tester, 'customer', 'checkout-top');
      await scrollTo(tester, find.byKey(const ValueKey('checkout-address-section')));
      await captureVisual(tester, 'customer', 'checkout-address');
      await tester.pumpWidget(const SizedBox());
    } finally {
      // Flutter checks painting globals before the normal test tearDown runs.
      restoreImages();
    }
  }, skip: !captureEnabled);
}
