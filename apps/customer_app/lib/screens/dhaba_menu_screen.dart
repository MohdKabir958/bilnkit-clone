import 'dart:async';
import 'package:flutter/material.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import 'package:provider/provider.dart';
import '../models/dhaba.dart';
import '../providers/cart_provider.dart';
import '../providers/dhaba_provider.dart';
import '../widgets/product_card.dart';
import '../widgets/product_details.dart';
import '../widgets/cart_actions.dart';
import '../widgets/cart_summary_bar.dart';
import '../widgets/ui/format.dart';

class DhabaMenuScreen extends StatefulWidget {
  const DhabaMenuScreen(
      {super.key, required this.dhaba, required this.selectedHostel});
  final Dhaba dhaba;
  final String? selectedHostel;
  @override
  State<DhabaMenuScreen> createState() => _DhabaMenuScreenState();
}

class _DhabaMenuScreenState extends State<DhabaMenuScreen> {
  final _searchController = TextEditingController();
  Timer? _searchDebounce;
  String _query = '', _category = 'All', _sort = 'Featured';
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(context.read<DhabaProvider>().loadCatalog());
    });
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final k = context.k;
    final provider = context.watch<DhabaProvider>();
    final cart = context.watch<CartProvider>();
    final store = provider.byId(widget.dhaba.id) ?? widget.dhaba;
    final all = _query.trim().isEmpty
        ? provider.getMenuItemsForDhaba(store.id)
        : provider.productsForQuery(store.id, _query);
    final categories = [
      'All',
      ...provider.orderDishCategories(all.map((p) => p.category).toSet())
    ];
    final selected = categories.contains(_category) ? _category : 'All';
    final items = all
        .where((p) =>
            (selected == 'All' || p.category == selected) &&
            ('${p.name} ${p.description} ${p.sku ?? ''} ${p.packSize} ${p.unit}'
                .toLowerCase()
                .contains(_query.trim().toLowerCase())))
        .toList();
    if (_sort == 'Price: low to high') {
      items.sort((a, b) => a.price.compareTo(b.price));
    }
    if (_sort == 'Price: high to low') {
      items.sort((a, b) => b.price.compareTo(a.price));
    }
    if (_sort == 'Available first') {
      items.sort((a, b) => (b.isAvailable && b.stockQty != 0 ? 1 : 0)
          .compareTo(a.isAvailable && a.stockQty != 0 ? 1 : 0));
    }
    return Scaffold(
      appBar: AppBar(title: Text(store.name)),
      bottomNavigationBar: cart.itemCount == 0
          ? null
          : SafeArea(
              top: false,
              child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: CartSummaryBar(
                      cart: cart, address: widget.selectedHostel))),
      body: RefreshIndicator(
          onRefresh: () async {
            await provider.refreshHome();
          },
          child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                    child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                  padding: const EdgeInsets.all(16),
                                  decoration: BoxDecoration(
                                      color: k.brandSoft,
                                      borderRadius: KRadius.card),
                                  child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Row(children: [
                                          Icon(Icons.storefront_outlined,
                                              color: k.brand),
                                          const SizedBox(width: 8),
                                          Expanded(
                                              child: Text(
                                                  store.isAcceptingOrders
                                                      ? 'Your neighbourhood grocery store'
                                                      : 'Store closed',
                                                  style: KraveoType.titleMd
                                                      .copyWith(
                                                          color: k.brand)))
                                        ]),
                                        if (store.cuisineLabel.isNotEmpty) ...[
                                          const SizedBox(height: 8),
                                          Text(store.cuisineLabel,
                                              style: KraveoType.bodySm
                                                  .copyWith(color: k.inkMuted))
                                        ],
                                        if (store.address.isNotEmpty) ...[
                                          const SizedBox(height: 8),
                                          Text(store.address,
                                              style: KraveoType.bodySm
                                                  .copyWith(color: k.inkMuted))
                                        ],
                                        const SizedBox(height: 8),
                                        Wrap(
                                            spacing: 12,
                                            runSpacing: 8,
                                            children: [
                                              Text(
                                                  'Delivery ${rupee(store.deliveryFee)}',
                                                  style: KraveoType.bodySm),
                                              if (store.distanceKm != null)
                                                Text(
                                                    '~${store.distanceKm!.toStringAsFixed(1)} km away',
                                                    style: KraveoType.bodySm),
                                              if (store.rating > 0)
                                                Text(
                                                    '★ ${store.rating.toStringAsFixed(1)}',
                                                    style: KraveoType.bodySm)
                                            ]),
                                        if (!store.isAcceptingOrders) ...[
                                          const SizedBox(height: 8),
                                          Text(
                                              'Browse products now. Ordering resumes when the store reopens.',
                                              style: KraveoType.bodySm)
                                        ],
                                      ])),
                              const SizedBox(height: 16),
                              TextField(
                                  controller: _searchController,
                                  onChanged: (value) {
                                    setState(() => _query = value);
                                    _searchDebounce?.cancel();
                                    if (value.trim().isNotEmpty) {
                                      _searchDebounce = Timer(
                                          const Duration(milliseconds: 350),
                                          () {
                                        if (mounted) {
                                          provider.loadProductPage(store.id,
                                              query: value, reset: true);
                                        }
                                      });
                                    }
                                  },
                                  decoration: InputDecoration(
                                      hintText: 'Search products in this store',
                                      prefixIcon: const Icon(Icons.search),
                                      suffixIcon: _query.isEmpty
                                          ? null
                                          : IconButton(
                                              tooltip: 'Clear search',
                                              onPressed: () {
                                                _searchController.clear();
                                                setState(() => _query = '');
                                              },
                                              icon: const Icon(Icons.close)))),
                              const SizedBox(height: 12),
                              Wrap(spacing: 8, runSpacing: 8, children: [
                                for (final category in categories)
                                  KChoiceChip(
                                      label: category,
                                      selected: selected == category,
                                      onTap: () =>
                                          setState(() => _category = category))
                              ]),
                              const SizedBox(height: 12),
                              Row(children: [
                                Expanded(
                                    child: Text('${items.length} products',
                                        style: KraveoType.titleMd)),
                                PopupMenuButton<String>(
                                    tooltip: 'Sort products',
                                    initialValue: _sort,
                                    onSelected: (value) =>
                                        setState(() => _sort = value),
                                    itemBuilder: (_) => [
                                          for (final label in [
                                            'Featured',
                                            'Available first',
                                            'Price: low to high',
                                            'Price: high to low'
                                          ])
                                            PopupMenuItem(
                                                value: label,
                                                child: Text(label))
                                        ],
                                    child: const Padding(
                                        padding: EdgeInsets.all(12),
                                        child: Row(children: [
                                          Icon(Icons.sort, size: 20),
                                          SizedBox(width: 6),
                                          Text('Sort')
                                        ])))
                              ]),
                            ]))),
                if (provider.hasCatalogFailed)
                  SliverToBoxAdapter(
                      child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 20),
                          child: Text(
                              'Could not refresh stock. Pull down to retry; checkout verifies availability.',
                              style:
                                  KraveoType.bodySm.copyWith(color: k.error)))),
                if (items.isEmpty)
                  SliverToBoxAdapter(
                      child: KEmptyState(
                          icon: Icons.inventory_2_outlined,
                          title: all.isEmpty
                              ? 'Products coming soon'
                              : 'No products found',
                          message: all.isEmpty
                              ? 'This store has not published its products yet. Try another store.'
                              : 'Try a different search or category.',
                          action: all.isEmpty
                              ? null
                              : KButton(
                                  label: 'Show all products',
                                  expand: false,
                                  onPressed: () {
                                    _searchController.clear();
                                    setState(() {
                                      _query = '';
                                      _category = 'All';
                                    });
                                  })))
                else
                  SliverPadding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                      sliver: SliverLayoutBuilder(
                          builder: (context, constraints) => SliverGrid(
                                gridDelegate:
                                    SliverGridDelegateWithFixedCrossAxisCount(
                                        crossAxisCount: productColumns(context,
                                            constraints.crossAxisExtent),
                                        mainAxisExtent: productExtent(context),
                                        crossAxisSpacing: 12,
                                        mainAxisSpacing: 12),
                                delegate: SliverChildBuilderDelegate(
                                    (context, index) {
                                  final item = items[index];
                                  return ProductCard(
                                      item: item,
                                      storeName: store.name,
                                      quantity:
                                          cart.getItemQuantityInCart(item.id),
                                      open: store.isAcceptingOrders,
                                      onAdd: () => addProduct(
                                          context, cart, store, item),
                                      onRemove: () => removeProduct(cart, item),
                                      onDetails: () async {
                                        final picked = await showProductDetails(
                                            context, item, all);
                                        if (picked == null ||
                                            !context.mounted) {
                                          return;
                                        }
                                        for (var n = 0; n < picked.$2; n++) {
                                          if (!await addProduct(context, cart,
                                                  store, picked.$1) ||
                                              !context.mounted) {
                                            break;
                                          }
                                        }
                                      });
                                }, childCount: items.length),
                              ))),
                if (provider.productPageLoading(store.id, query: _query))
                  const SliverToBoxAdapter(
                      child: Padding(
                          padding: EdgeInsets.all(20),
                          child: LinearProgressIndicator())),
                if (provider.productPageFailed(store.id, query: _query))
                  SliverToBoxAdapter(
                      child: Padding(
                          padding: const EdgeInsets.all(20),
                          child: KButton(
                              label: 'Retry loading products',
                              kind: KButtonKind.tonal,
                              onPressed: () => provider.loadProductPage(
                                  store.id,
                                  query: _query,
                                  reset: true)))),
                if (provider.hasMoreProducts(store.id, query: _query))
                  SliverToBoxAdapter(
                      child: Padding(
                          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                          child: KButton(
                              label: 'Load more products',
                              kind: KButtonKind.tonal,
                              loading: provider.productPageLoading(store.id,
                                  query: _query),
                              onPressed: () => provider
                                  .loadProductPage(store.id, query: _query)))),
              ])),
    );
  }
}
