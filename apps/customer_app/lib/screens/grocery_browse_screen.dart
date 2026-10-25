import 'dart:async';
import 'package:flutter/material.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import 'package:provider/provider.dart';
import '../models/dhaba.dart';
import '../models/menu_item.dart';
import '../models/grocery_department.dart';
import '../providers/dhaba_provider.dart';
import '../providers/session_provider.dart';
import '../services/customer_api_service.dart';
import '../widgets/dhaba_card.dart';
import '../widgets/grocery_home_components.dart';
import '../widgets/grocery_product_actions.dart';
import '../widgets/ui/category_icons.dart';
import 'dhaba_menu_screen.dart';

class NearbyStoresScreen extends StatelessWidget {
  const NearbyStoresScreen(
      {super.key, this.savedOnly = false, this.embedded = false});
  final bool savedOnly, embedded;
  @override
  Widget build(BuildContext context) {
    final catalog = context.watch<DhabaProvider>();
    final stores =
        catalog.dhabas.where((s) => !savedOnly || s.isFavorite).toList();
    return Scaffold(
        backgroundColor: groceryCanvas,
        appBar: embedded
            ? null
            : AppBar(title: Text(savedOnly ? 'Saved stores' : 'Nearby Stores')),
        body: Column(children: [
          if (!savedOnly)
            SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                child: Row(children: [
                  for (final (index, chip) in catalog.categoryChips.indexed)
                    Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: KChoiceChip(
                            label: chip.label,
                            icon: categoryIcon(
                                key: chip.iconKey, label: chip.label),
                            selected: catalog.selectedCategoryIndex == index,
                            onTap: () =>
                                catalog.setSelectedCategoryIndex(index)))
                ])),
          Expanded(
              child: stores.isEmpty
                  ? Center(
                      child: Text(savedOnly
                          ? 'No saved stores yet.'
                          : 'No stores match this category.'))
                  : ListView.builder(
                      padding: const EdgeInsets.all(14),
                      itemCount: stores.length,
                      itemBuilder: (context, index) {
                        final store = stores[index];
                        return DhabaCard(
                            dhaba: store,
                            onFavoriteToggle: () =>
                                catalog.toggleFavorite(store.id),
                            onTap: () => Navigator.push(
                                context,
                                MaterialPageRoute(
                                    builder: (_) => DhabaMenuScreen(
                                        dhaba: store,
                                        selectedHostel: context
                                            .read<SessionProvider>()
                                            .deliveryPoint))));
                      })),
        ]));
  }
}

class GroceryCategoriesScreen extends StatelessWidget {
  const GroceryCategoriesScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
      backgroundColor: groceryCanvas,
      appBar: AppBar(title: const Text('Shop by Category')),
      body: GridView.builder(
          padding: const EdgeInsets.all(14),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount:
                  MediaQuery.textScalerOf(context).scale(12) > 18 ? 2 : 3,
              mainAxisExtent: 125,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10),
          itemCount: GroceryDepartment.all.length,
          itemBuilder: (context, index) => GroceryCategoryTile(
              department: GroceryDepartment.all[index],
              onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => GroceryBrowseScreen(
                          department: GroceryDepartment.all[index]))))));
}

class GrocerySavedScreen extends StatelessWidget {
  const GrocerySavedScreen({super.key});
  @override
  Widget build(BuildContext context) => DefaultTabController(
      length: 2,
      child: Scaffold(
          backgroundColor: groceryCanvas,
          appBar: AppBar(
              title: const Text('Your favourites'),
              bottom: const TabBar(
                  tabs: [Tab(text: 'Products'), Tab(text: 'Stores')])),
          body: const TabBarView(children: [
            GroceryBrowseScreen(savedOnly: true, embedded: true),
            NearbyStoresScreen(savedOnly: true, embedded: true)
          ])));
}

class GroceryBrowseScreen extends StatefulWidget {
  const GroceryBrowseScreen(
      {super.key,
      this.department,
      this.savedOnly = false,
      this.embedded = false});
  final GroceryDepartment? department;
  final bool savedOnly, embedded;
  @override
  State<GroceryBrowseScreen> createState() => _GroceryBrowseScreenState();
}

class _GroceryBrowseScreenState extends State<GroceryBrowseScreen> {
  final Map<(String, String), List<MenuItemModel>> _pages = {};
  final Map<(String, String), String?> _cursors = {};
  final Set<(String, String)> _loaded = {};
  bool _busy = false, _remote = false;
  String? _error;
  @override
  void initState() {
    super.initState();
    if (widget.department != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _initialize());
    }
  }

  Future<void> _initialize() async {
    final catalog = context.read<DhabaProvider>();
    await catalog.loadCategories();
    if (!mounted) return;
    final ids = catalog.productCategories
        .where((c) => widget.department!.includes(c.name))
        .map((c) => c.id)
        .toList();
    if (ids.isNotEmpty) {
      for (final store in catalog.allDhabas) {
        for (final id in ids) {
          _cursors[(store.id, id)] = null;
        }
      }
      _remote = true;
      await _load(first: true);
    }
  }

  Future<void> _load({bool first = false}) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final address = CustomerApiService.selectedAddressId;
    try {
      if (!_remote) {
        await context.read<DhabaProvider>().loadMoreHomeProducts();
      } else {
        final keys = _cursors.keys
            .where((k) => first || !_loaded.contains(k) || _cursors[k] != null)
            .toList();
        for (var i = 0; i < keys.length; i += 3) {
          await Future.wait(keys.skip(i).take(3).map((key) async {
            final page = await CustomerApiService.fetchProductPage(key.$1,
                categoryId: key.$2, after: first ? null : _cursors[key]);
            if (!mounted || address != CustomerApiService.selectedAddressId) {
              return;
            }
            final items = page.items.map(MenuItemModel.fromJson).toList();
            context.read<DhabaProvider>().rememberProducts(key.$1, items);
            _loaded.add(key);
            _pages[key] = [...?_pages[key], ...items];
            _cursors[key] = page.nextCursor;
          }));
        }
      }
    } catch (_) {
      if (mounted) {
        setState(() =>
            _error = 'Products could not be loaded. Retry to keep browsing.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final catalog = context.watch<DhabaProvider>();
    final rows = <(MenuItemModel, Dhaba)>[];
    for (final store in catalog.allDhabas) {
      final items = _remote
          ? _pages.entries
              .where((e) => e.key.$1 == store.id)
              .expand((e) => e.value)
          : catalog.homeProducts(store.id);
      final seen = <String>{};
      for (final item in items) {
        if (seen.add(item.id) &&
            (!widget.savedOnly || catalog.isProductSaved(item.id)) &&
            (widget.department == null ||
                widget.department!.includes(item.category))) {
          rows.add((item, store));
        }
      }
    }
    final more = _remote
        ? _cursors.values.any((v) => v != null)
        : catalog.allDhabas.any(
            (s) => catalog.hasMoreProducts(s.id, query: catalog.searchQuery));
    final body = CustomScrollView(slivers: [
      if (widget.department == null && !widget.savedOnly)
        const SliverToBoxAdapter(
            child: Padding(
                padding: EdgeInsets.fromLTRB(14, 4, 14, 8),
                child:
                    Text('Products offered by stores serving your address.'))),
      if (_busy) const SliverToBoxAdapter(child: LinearProgressIndicator()),
      if (_error != null)
        SliverToBoxAdapter(
            child: Padding(
                padding: const EdgeInsets.all(14),
                child: TextButton(
                    onPressed: () => _load(first: _pages.isEmpty),
                    child: Text(_error!)))),
      if (rows.isEmpty && !_busy)
        SliverToBoxAdapter(
            child: Padding(
                padding: const EdgeInsets.all(28),
                child: Text(widget.savedOnly
                    ? 'Tap a product heart to save it here.'
                    : 'No products in this category are available for your address yet.'))),
      SliverPadding(
          padding: const EdgeInsets.all(14),
          sliver: SliverLayoutBuilder(
              builder: (context, constraints) => SliverGrid(
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount:
                          groceryColumns(context, constraints.crossAxisExtent),
                      mainAxisExtent: groceryExtent(context),
                      crossAxisSpacing: 8,
                      mainAxisSpacing: 8),
                  delegate: SliverChildBuilderDelegate(
                      (context, index) => groceryProduct(
                          context, rows[index].$1, rows[index].$2),
                      childCount: rows.length)))),
      if (more)
        SliverToBoxAdapter(
            child: Padding(
                padding: const EdgeInsets.all(14),
                child: FilledButton(
                    onPressed: _busy ? null : () => _load(),
                    child: const Text('Load more products')))),
    ]);
    return widget.embedded
        ? body
        : Scaffold(
            backgroundColor: groceryCanvas,
            appBar: AppBar(
                title: Text(widget.department?.label ?? 'Popular Products')),
            body: body);
  }
}
