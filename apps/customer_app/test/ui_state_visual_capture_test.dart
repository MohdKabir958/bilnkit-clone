// Opt-in renderer evidence: controlled HTTP states, never production/demo data.
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import 'package:customer_app/providers/cart_provider.dart';
import 'package:customer_app/providers/dhaba_provider.dart';
import 'package:customer_app/providers/order_provider.dart';
import 'package:customer_app/providers/session_provider.dart';
import 'package:customer_app/screens/home_screen.dart';
import 'package:customer_app/services/customer_api_service.dart';
import '../../../packages/kraveo_ui/test_support/visual_capture.dart';
import 'support/order_fakes.dart';

void main() {
  setUpAll(loadVisualFonts);
  testWidgets('capture customer loading empty and offline HTTP states',
      (tester) async {
    await prepareVisual(tester);
    SharedPreferences.setMockInitialValues({});
    addTearDown(() => CustomerApiService.httpClientOverride = null);
    final catalog = DhabaProvider();
    final orders = fakeOrders(FakeOrderApi());
    final cart = CartProvider();
    final session = SessionProvider(initial: SessionStatus.signedIn);
    final pending = Completer<http.Response>();
    CustomerApiService.httpClientOverride = MockClient((request) async =>
        request.url.path.endsWith('/nearby')
            ? await pending.future
            : http.Response('{"success":true,"data":[]}', 200));
    await tester.pumpWidget(captureRoot(MultiProvider(
        providers: [
          ChangeNotifierProvider<DhabaProvider>.value(value: catalog),
          ChangeNotifierProvider<OrderProvider>.value(value: orders),
          ChangeNotifierProvider<CartProvider>.value(value: cart),
          ChangeNotifierProvider<SessionProvider>.value(value: session),
        ],
        child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: KraveoTheme.customer(),
            home: const HomeScreen()))));
    await tester.pump();
    expect(catalog.isCatalogLoading, isTrue);
    await captureVisual(tester, 'customer', 'home-loading');
    pending.complete(
        http.Response('{"success":true,"data":[],"nextCursor":null}', 200));
    await tester.pump();
    await captureVisual(tester, 'customer', 'home-empty');
    expect(find.text('No stores available here yet'), findsOneWidget);
    CustomerApiService.httpClientOverride = MockClient(
        (_) async => throw http.ClientException('Isolated offline fixture'));
    catalog.resetForAddress();
    await catalog.refreshHome();
    await captureVisual(tester, 'customer', 'home-offline');
    expect(find.text("Can't load nearby stores"), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    orders.dispose();
    catalog.dispose();
    cart.dispose();
    session.dispose();
  }, skip: !captureEnabled);
}
