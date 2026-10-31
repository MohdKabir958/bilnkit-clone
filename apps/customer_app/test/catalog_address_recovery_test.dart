import 'dart:convert';

import 'package:customer_app/providers/cart_provider.dart';
import 'package:customer_app/providers/dhaba_provider.dart';
import 'package:customer_app/providers/order_provider.dart';
import 'package:customer_app/providers/session_provider.dart';
import 'package:customer_app/screens/addresses_screen.dart';
import 'package:customer_app/screens/home_screen.dart';
import 'package:customer_app/services/customer_api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/order_fakes.dart';

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    await CustomerApiService.clearToken();
    await CustomerApiService.saveToken('synthetic-catalog-session');
  });
  tearDown(() async {
    CustomerApiService.httpClientOverride = null;
    await CustomerApiService.clearToken();
  });

  testWidgets(
      'a real address-required catalog response opens the saved-address flow, not a Wi-Fi error',
      (tester) async {
    var nearbyRequests = 0;
    CustomerApiService.httpClientOverride = MockClient((request) async {
      if (request.url.path.endsWith('/vendors/nearby')) {
        nearbyRequests++;
        return http.Response(
            jsonEncode({
              'success': false,
              'code': 'ADDRESS_REQUIRED',
              'field': 'addressId',
            }),
            400);
      }
      return http.Response('{"success":true,"data":[]}', 200);
    });
    final session = SessionProvider(initial: SessionStatus.checking)
      ..beginForTest({
        'id': 'synthetic-customer',
        'role': 'STUDENT',
        'name': 'Synthetic Customer',
      });
    final catalog = DhabaProvider();
    final cart = CartProvider();
    final orders = fakeOrders(FakeOrderApi());
    addTearDown(session.dispose);
    addTearDown(catalog.dispose);
    addTearDown(cart.dispose);
    addTearDown(orders.dispose);
    await tester.pumpWidget(MultiProvider(
      providers: [
        ChangeNotifierProvider<SessionProvider>.value(value: session),
        ChangeNotifierProvider<DhabaProvider>.value(value: catalog),
        ChangeNotifierProvider<CartProvider>.value(value: cart),
        ChangeNotifierProvider<OrderProvider>.value(value: orders),
      ],
      child: MaterialApp(
          theme: KraveoTheme.customer(), home: const HomeScreen()),
    ));
    // Home includes continuously animated loading decorations. Wait for the
    // actual catalog outcome rather than waiting for every animation to stop.
    for (var frame = 0;
        frame < 50 && find.text('Choose where to deliver').evaluate().isEmpty;
        frame++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(nearbyRequests, 1);
    expect(find.text('Choose where to deliver'), findsOneWidget);
    expect(find.textContaining('Choose or update your delivery address'),
        findsOneWidget);
    expect(find.textContaining('Check your connection'), findsNothing);
    expect(find.text("Can't load nearby stores"), findsNothing);
    final chooseAddress =
        find.widgetWithText(KButton, 'Choose delivery address');
    await tester.ensureVisible(chooseAddress);
    await tester.tap(chooseAddress);
    for (var frame = 0;
        frame < 50 && find.text('Add address').evaluate().isEmpty;
        frame++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.byType(AddressesScreen), findsOneWidget);
    expect(find.text('Add address'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
}
