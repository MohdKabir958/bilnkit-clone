import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import 'package:customer_app/widgets/product_card.dart';
import 'package:customer_app/widgets/cart_actions.dart';
import 'package:customer_app/models/menu_item.dart';
import 'package:customer_app/models/dhaba.dart';
import 'package:customer_app/providers/cart_provider.dart';
import '../../../packages/kraveo_ui/test_support/visual_capture.dart';

const product = MenuItemModel(
    id: 'milk',
    vendorId: 'store',
    name: 'Fresh toned milk with a long product label',
    price: 32.50,
    category: 'Dairy',
    description: 'Store product information',
    imageUrl: '',
    isAvailable: true,
    packSize: '500',
    unit: 'ml',
    stockQty: 2,
    mrpPaise: 4000);
final store = Dhaba(
    id: 'store',
    name: 'Local Market',
    category: 'Groceries',
    rating: 0,
    eta: '',
    bannerUrl: '',
    isAcceptingOrders: true,
    address: '',
    deliveryFee: 25,
    minOrder: 0);
void main() {
  setUpAll(loadVisualFonts);
  for (final width in [320.0, 360.0, 390.0, 430.0]) {
    for (final scale in [1.0, 1.3, 2.0]) {
      testWidgets('grocery cards and navigation $width px at $scale text',
          (tester) async {
        await prepareVisual(tester, width: width, height: 844, scale: scale);
        var quantity = 0;
        await tester.pumpWidget(captureRoot(MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: KraveoTheme.customer(),
            home: StatefulBuilder(
                builder: (context, update) => Scaffold(
                      body: CustomScrollView(slivers: [
                        SliverPadding(
                            padding: const EdgeInsets.all(20),
                            sliver: SliverLayoutBuilder(
                                builder: (context, box) => SliverGrid(
                                      gridDelegate:
                                          SliverGridDelegateWithFixedCrossAxisCount(
                                              crossAxisCount: productColumns(
                                                  context, box.crossAxisExtent),
                                              mainAxisExtent:
                                                  productExtent(context),
                                              crossAxisSpacing: 12,
                                              mainAxisSpacing: 12),
                                      delegate: SliverChildBuilderDelegate(
                                          (_, index) => ProductCard(
                                              item: product,
                                              storeName: store.name,
                                              quantity: quantity,
                                              onDetails: () {},
                                              onAdd: () =>
                                                  update(() => quantity++),
                                              onRemove: () =>
                                                  update(() => quantity--)),
                                          childCount: 4),
                                    )))
                      ]),
                      bottomNavigationBar: KGlassNav(items: const [
                        KNavItem(Icons.home_outlined, 'Home'),
                        KNavItem(Icons.local_shipping_outlined, 'Track'),
                        KNavItem(Icons.receipt_long_outlined, 'Orders'),
                        KNavItem(Icons.person_outline, 'Me')
                      ], index: 0, onChanged: (_) {}),
                    )))));
        await tester.pump(const Duration(seconds: 1));
        expect(tester.takeException(), isNull);
        await tester.tap(find.text('ADD').first);
        await tester.pump(const Duration(seconds: 1));
        expect(quantity, 1);
        expect(find.text('Track'), findsOneWidget);
        expect(tester.takeException(), isNull);
        if (captureEnabled && (width == 320 || width == 430)) {
          await captureVisual(
              tester, 'customer', 'product-grid-${width.toInt()}-text-$scale');
        }
      });
    }
  }
  testWidgets('shared product action enforces stock on Home and catalog',
      (tester) async {
    final cart = CartProvider();
    await tester.pumpWidget(MaterialApp(
        theme: KraveoTheme.customer(),
        home: Builder(
            builder: (context) => Scaffold(
                body: TextButton(
                    onPressed: () => addProduct(context, cart, store, product),
                    child: const Text('Add product'))))));
    for (var i = 0; i < 3; i++) {
      await tester.tap(find.text('Add product'));
      await tester.pump();
    }
    expect(cart.itemCount, 2);
    expect(cart.subtotal, 65);
    expect(find.textContaining('No more packs are available'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    cart.dispose();
  });
}
