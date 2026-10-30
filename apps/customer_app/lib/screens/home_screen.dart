import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../providers/dhaba_provider.dart';
import '../providers/order_provider.dart';
import '../providers/session_provider.dart';
import '../providers/cart_provider.dart';
import '../widgets/cart_sheet.dart';
import '../widgets/grocery_home_components.dart';
import '../widgets/grocery_product_actions.dart';
import '../models/grocery_department.dart';
import 'grocery_browse_screen.dart';
import '../widgets/ui/format.dart';
import '../widgets/ui/floating_bar.dart';
import '../models/delivery_address.dart';
import 'addresses_screen.dart';
import '../widgets/ui/snack.dart';
import '../widgets/ui/status_map.dart';
import 'dhaba_menu_screen.dart';
import 'live_tracking_screen.dart';
import 'order_history_screen.dart';
import 'profile_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentTab = 0;

  /// Catch up on order changes and the kitchen catalog (open / closed, sold out, new kitchens)
  /// when the app returns to the foreground (contract 3).
  late final AppLifecycleListener _lifecycle =
      AppLifecycleListener(onResume: () {
    if (!mounted) return;
    context.read<OrderProvider>().onAppResumed();
    unawaited(context.read<DhabaProvider>().refreshHome());
  });
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _lifecycle; // start listening
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      // The backend resolves an owned default when no address is supplied.
      // Reloading addresses here would overwrite an explicit customer selection.
      unawaited(context.read<DhabaProvider>().refreshHome());
    });
  }

  /// Pull-to-refresh on Home: kitchens and orders. Says so when the kitchens could not be refreshed.
  Future<void> _refreshHome() async {
    final orders = context.read<OrderProvider>();
    final dhabas = context.read<DhabaProvider>();
    unawaited(orders.refreshActive());
    final ok = await dhabas.refreshHome();
    if (!mounted || ok) return;
    showKSnack(context,
        'Couldn\'t refresh the stores. ${dhabas.catalogFailureMessage ?? 'Please try again.'}',
        error: true);
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _goToTab(int index) => setState(() => _currentTab = index);

  /// Drop-off point changes made from Home are saved to the profile too, so the Me tab,
  /// checkout and the next launch all agree. Reverts (with a message) if saving fails.
  Future<void> _chooseAddress() async {
    final selected = await Navigator.push<DeliveryAddress>(
        context, MaterialPageRoute(builder: (_) => const AddressesScreen()));
    if (!mounted) return;
    if (selected != null) {
      context.read<SessionProvider>().selectDeliveryAddress(selected);
    } else {
      await context.read<SessionProvider>().refreshDeliveryAddress();
    }
    if (mounted) {
      context.read<DhabaProvider>().resetForAddress();
      await context.read<DhabaProvider>().refreshHome();
    }
  }

  @override
  Widget build(BuildContext context) {
    final k = context.k;
    final selectedHostel =
        context.select<SessionProvider, String?>((s) => s.deliveryPoint);
    // Back on Orders / Track / Me returns to the Home tab first; only Home itself leaves the app.
    return PopScope(
      canPop: _currentTab == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _currentTab != 0) _goToTab(0);
      },
      child: _buildScaffold(context, k, selectedHostel),
    );
  }

  Widget _buildScaffold(
      BuildContext context, KraveoTokens k, String? selectedHostel) {
    return Scaffold(
      backgroundColor: groceryCanvas,
      extendBody: true,
      body: IndexedStack(
        index: _currentTab,
        children: [
          // Builder: the feed must read the padding Scaffold reports for the floating nav.
          Builder(builder: _buildHomeFeed),
          LiveTrackingScreen(
              visible: _currentTab == 1, onExplore: () => _goToTab(0)),
          OrderHistoryScreen(
            selectedHostel: selectedHostel,
            onTrackOrder: () => _goToTab(1),
            onExplore: () => _goToTab(0),
          ),
          ProfileScreen(
              onOpenOrders: () => _goToTab(2), onTrackOrder: () => _goToTab(1)),
        ],
      ),
      bottomNavigationBar: KGlassNav(
        dense: true,
        index: _currentTab,
        onChanged: _goToTab,
        items: const [
          KNavItem(LucideIcons.house, 'Home'),
          KNavItem(LucideIcons.bike, 'Track'),
          KNavItem(LucideIcons.receiptText, 'Orders'),
          KNavItem(LucideIcons.user, 'Me'),
        ],
      ),
    );
  }

  void _openStores() => Navigator.push(
      context, MaterialPageRoute(builder: (_) => const NearbyStoresScreen()));
  void _openProducts() => Navigator.push(
      context, MaterialPageRoute(builder: (_) => const GroceryBrowseScreen()));
  Widget _buildHomeFeed(BuildContext context) {
    final catalog = context.watch<DhabaProvider>(),
        orders = context.watch<OrderProvider>();
    final session = context.watch<SessionProvider>();
    final cart = context.watch<CartProvider>();
    final stores = catalog.dhabas;
    final query = catalog.searchQuery.trim().toLowerCase();
    final selectedCategory = catalog.selectedCategoryIndex == 0
        ? null
        : catalog.categoryChips[catalog.selectedCategoryIndex].label;
    final products = [
      for (final store in stores)
        ...catalog
            .homeProducts(store.id)
            .where((p) =>
                (query.isEmpty ||
                    '${p.name} ${p.description} ${p.sku ?? ''} ${store.name}'
                        .toLowerCase()
                        .contains(query)) &&
                (selectedCategory == null ||
                    store.primaryCategoryId != null ||
                    p.category.toLowerCase() == selectedCategory.toLowerCase()))
            .map((p) => (p, store))
    ];
    final candidates = stores
        .where((s) => s.isAcceptingOrders && s.distanceKm != null)
        .toList()
      ..sort((a, b) => a.distanceKm!.compareTo(b.distanceKm!));
    final bestId = candidates.isEmpty ? null : candidates.first.id;
    final navInset = MediaQuery.paddingOf(context).bottom;
    final active = orders.activeOrder?.status.isLive == true;
    final textScale = MediaQuery.textScalerOf(context).scale(12) / 12;
    return AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light
            .copyWith(statusBarColor: Colors.transparent),
        child: Stack(children: [
          RefreshIndicator(
              onRefresh: _refreshHome,
              child: CustomScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  slivers: [
                    SliverToBoxAdapter(
                        child: GroceryHeader(
                            address: session.deliveryPoint ??
                                'Choose delivery address',
                            cartCount: cart.itemCount,
                            search: _searchController,
                            onSearch: catalog.setSearchQuery,
                            onClear: () {
                              _searchController.clear();
                              catalog.setSearchQuery('');
                            },
                            onAddress: _chooseAddress,
                            onCart: () => CartSheet.show(context,
                                selectedHostel: session.deliveryPoint),
                            onSaved: () => Navigator.push(
                                context,
                                MaterialPageRoute(
                                    builder: (_) =>
                                        const GrocerySavedScreen())))),
                    SliverToBoxAdapter(
                        child: GrocerySectionTitle('Nearby Stores',
                            onViewAll: _openStores,
                            actionKey: const ValueKey('all-nearby-stores'))),
                    if (catalog.isCatalogLoading)
                      const SliverToBoxAdapter(
                          child: Padding(
                              padding: EdgeInsets.symmetric(horizontal: 14),
                              child: KSkeleton(height: 110)))
                    else if (catalog.hasCatalogFailed &&
                        catalog.allDhabas.isEmpty)
                      SliverToBoxAdapter(
                          child: KEmptyState(
                              icon: LucideIcons.circleAlert,
                              title: 'Nearby stores unavailable',
                              message: catalog.catalogFailureMessage ??
                                  'Grozo could not load stores. Please try again.',
                              action: KButton(
                                  label: (session.selectedAddress == null ||
                                          catalog.catalogNeedsAddress)
                                      ? 'Choose delivery address'
                                      : 'Try again',
                                  onPressed: (session.selectedAddress == null ||
                                          catalog.catalogNeedsAddress)
                                      ? _chooseAddress
                                      : () => unawaited(catalog.refreshHome()))))
                    else if (catalog.allDhabas.isEmpty)
                      SliverToBoxAdapter(
                          child: KEmptyState(
                              icon: LucideIcons.store,
                              title: 'No stores available here yet',
                              message:
                                  'Stores near you will appear here when they serve your delivery address. Pull down to check again.',
                              action: KButton(
                                  label: 'Refresh', onPressed: _refreshHome)))
                    else if (stores.isEmpty && !catalog.searchingProducts)
                      SliverToBoxAdapter(
                          child: KEmptyState(
                              icon: LucideIcons.searchX,
                              title: catalog.showFavoritesOnly
                                  ? 'No favourites yet'
                                  : 'No stores match',
                              message:
                                  'Try a different search or category, or clear the filters to see every store.',
                              action: KButton(
                                  label: 'Clear filters',
                                  onPressed: () {
                                    _searchController.clear();
                                    catalog.setSearchQuery('');
                                    catalog.setSelectedCategoryIndex(0);
                                    if (catalog.showFavoritesOnly) {
                                      catalog.toggleFavoritesOnly();
                                    }
                                  })))
                    else
                      SliverToBoxAdapter(
                          child: LayoutBuilder(builder: (context, constraints) {
                        final width = textScale > 1.25
                            ? 125.0
                            : ((constraints.maxWidth - 28 - 21) / 4)
                                .clamp(78.0, 150.0);
                        return SizedBox(
                            height: 104 + (textScale - 1).clamp(0, 2) * 58,
                            child: ListView.separated(
                                scrollDirection: Axis.horizontal,
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 14, vertical: 2),
                                itemCount: stores.length,
                                separatorBuilder: (_, __) =>
                                    const SizedBox(width: 7),
                                itemBuilder: (context, index) {
                                  final store = stores[index];
                                  return SizedBox(
                                      width: width,
                                      child: NearbyStoreTile(
                                          store: store,
                                          illustration: index,
                                          bestChoice: store.id == bestId,
                                          onTap: () => Navigator.push(
                                              context,
                                              MaterialPageRoute(
                                                  builder: (_) => DhabaMenuScreen(
                                                      dhaba: store,
                                                      selectedHostel: session
                                                          .deliveryPoint)))));
                                }));
                      })),
                    SliverToBoxAdapter(
                        child: GrocerySectionTitle('Shop by Category',
                            actionKey: const ValueKey('all-grocery-categories'),
                            onViewAll: () => Navigator.push(
                                context,
                                MaterialPageRoute(
                                    builder: (_) =>
                                        const GroceryCategoriesScreen())))),
                    SliverPadding(
                        padding: const EdgeInsets.symmetric(horizontal: 14),
                        sliver: SliverGrid(
                            gridDelegate:
                                SliverGridDelegateWithFixedCrossAxisCount(
                                    crossAxisCount: textScale > 1.4 ? 3 : 5,
                                    mainAxisExtent:
                                        75 + (textScale - 1).clamp(0, 2) * 45,
                                    crossAxisSpacing: 7,
                                    mainAxisSpacing: 7),
                            delegate: SliverChildBuilderDelegate(
                                (context, index) => GroceryCategoryTile(
                                    department: GroceryDepartment.all[index],
                                    onTap: () => Navigator.push(
                                        context,
                                        MaterialPageRoute(
                                            builder: (_) => GroceryBrowseScreen(
                                                department: GroceryDepartment
                                                    .all[index])))),
                                childCount: GroceryDepartment.all.length))),
                    SliverToBoxAdapter(
                        child: GrocerySectionTitle('Popular Products',
                            onViewAll: _openProducts,
                            actionKey: const ValueKey('all-popular-products'))),
                    if (catalog.searchingProducts)
                      const SliverToBoxAdapter(
                          child: LinearProgressIndicator()),
                    SliverPadding(
                        padding: const EdgeInsets.symmetric(horizontal: 14),
                        sliver: SliverLayoutBuilder(
                            builder: (context, constraints) => SliverGrid(
                                gridDelegate:
                                    SliverGridDelegateWithFixedCrossAxisCount(
                                        crossAxisCount: groceryColumns(context,
                                            constraints.crossAxisExtent),
                                        mainAxisExtent: groceryExtent(context),
                                        crossAxisSpacing: 8,
                                        mainAxisSpacing: 8),
                                delegate: SliverChildBuilderDelegate(
                                    (context, index) => groceryProduct(context,
                                        products[index].$1, products[index].$2),
                                    childCount: products.length)))),
                    if (catalog.productSearchFailed)
                      const SliverToBoxAdapter(
                          child: Padding(
                              padding: EdgeInsets.all(14),
                              child: Text(
                                  'Some products could not be loaded. Pull down to retry.'))),
                    if (catalog.allDhabas.any((s) => catalog
                        .hasMoreProducts(s.id, query: catalog.searchQuery)))
                      SliverToBoxAdapter(
                          child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: KButton(
                                  label: 'Load more products',
                                  onPressed: catalog.loadMoreHomeProducts))),
                    if (query.isEmpty && orders.isFirstTimeCustomer)
                      const SliverToBoxAdapter(child: _PromoCard()),
                    SliverToBoxAdapter(
                        child:
                            SizedBox(height: navInset + (active ? 112 : 18))),
                  ])),
          Positioned(
              left: 0,
              right: 0,
              bottom: navInset + 8,
              child: KBarSwitcher(
                  visible: active,
                  child: active
                      ? _ActiveOrderBar(
                          orderProvider: orders, onTap: () => _goToTab(1))
                      : const SizedBox.shrink())),
        ]));
  }
}

/// The one promo we actually have: the WELCOME20 coupon that the cart understands.
class _PromoCard extends StatelessWidget {
  const _PromoCard();

  static const String _code = 'WELCOME20';

  @override
  Widget build(BuildContext context) {
    final k = context.k;
    return Padding(
      padding: const EdgeInsets.fromLTRB(KSpace.gutter, 18, KSpace.gutter, 18),
      child: KPressable(
        semanticLabel: 'Copy coupon code $_code',
        onTap: () {
          Clipboard.setData(const ClipboardData(text: _code));
          showKSnack(context, '$_code copied. Apply it in your cart.',
              icon: LucideIcons.ticket);
        },
        scale: 0.98,
        child: Container(
          width: double.infinity,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: k.brand,
            borderRadius: BorderRadius.circular(KRadius.xl),
            boxShadow: KShadow.lift(k.shadowTint),
          ),
          child: Stack(children: [
            Positioned(
              right: -34,
              top: -34,
              child: Container(
                  width: 150,
                  height: 150,
                  decoration: BoxDecoration(
                      color: KraveoPalette.g700.withValues(alpha: 0.55),
                      shape: BoxShape.circle)),
            ),
            Positioned(
              right: 14,
              bottom: 10,
              child: Icon(LucideIcons.badgePercent,
                  size: 64, color: k.onBrand.withValues(alpha: 0.14)),
            ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('FIRST ORDER',
                        style: KraveoType.label.copyWith(
                            color: k.onBrand.withValues(alpha: 0.75),
                            letterSpacing: 1.2)),
                    const SizedBox(height: 6),
                    Text('20% off,\nup to ₹50',
                        style: KraveoType.headline.copyWith(color: k.onBrand)),
                    const SizedBox(height: 4),
                    Text('On orders of ₹100 or more.',
                        style: KraveoType.bodySm.copyWith(
                            color: k.onBrand.withValues(alpha: 0.85))),
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 9),
                      decoration: BoxDecoration(
                          color: k.accent,
                          borderRadius: BorderRadius.circular(KRadius.pill)),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Text(_code,
                            style: KraveoType.button.copyWith(
                                color: k.onAccent,
                                fontSize: 14,
                                letterSpacing: 1.2)),
                        const SizedBox(width: 8),
                        Icon(LucideIcons.copy, size: 15, color: k.onAccent),
                      ]),
                    ),
                  ]),
            ),
          ]),
        ),
      ),
    );
  }
}

class _ActiveOrderBar extends StatelessWidget {
  const _ActiveOrderBar({required this.orderProvider, required this.onTap});

  final OrderProvider orderProvider;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final k = context.k;
    final order = orderProvider.activeOrder!;
    return KFloatingBar(
      semanticLabel:
          'Active order from ${order.title}: ${orderHeadline(order)}. Open tracking',
      onTap: onTap,
      leading: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
            color: k.onBrand.withValues(alpha: 0.16), shape: BoxShape.circle),
        child: Icon(LucideIcons.bike, size: 22, color: k.onBrand),
      ),
      title: Text(orderHeadline(order),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: KraveoType.titleMd.copyWith(color: k.onBrand)),
      subtitle: order.otpCode != null
          ? 'Delivery verification code ${order.otpCode}'
          : (order.awaitsPayment
              ? 'Pay by ${clockLabel(order.paymentDeadline)} · ${order.title}'
              : order.title),
      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
        Text('Track',
            style: KraveoType.button.copyWith(color: k.onBrand, fontSize: 14)),
        const SizedBox(width: 4),
        Icon(LucideIcons.arrowRight, size: 18, color: k.onBrand),
      ]),
    );
  }
}
