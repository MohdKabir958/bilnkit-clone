import 'package:flutter/material.dart';
import '../models/menu_item.dart';
import 'ui/k_image.dart';
import 'ui/format.dart';

/// A product's sellable variants are the loaded, serviceable store's real SKUs.
Future<(MenuItemModel, int)?> showProductDetails(
    BuildContext context, MenuItemModel item, List<MenuItemModel> items) {
  final variants = item.productKey == null
      ? [item]
      : items
          .where((p) =>
              p.vendorId == item.vendorId && p.productKey == item.productKey)
          .toList();
  return showModalBottomSheet<(MenuItemModel, int)>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _ProductDetails(initial: item, variants: variants));
}

class _ProductDetails extends StatefulWidget {
  const _ProductDetails({required this.initial, required this.variants});
  final MenuItemModel initial;
  final List<MenuItemModel> variants;
  @override
  State<_ProductDetails> createState() => _ProductDetailsState();
}

class _ProductDetailsState extends State<_ProductDetails> {
  late MenuItemModel item = widget.initial;
  int quantity = 1;
  @override
  Widget build(BuildContext context) {
    final max = (item.stockQty ?? 20).clamp(0, 20);
    return SizedBox(
        height: MediaQuery.sizeOf(context).height * .85,
        child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(children: [
                    Expanded(
                        child: Text(item.name,
                            style: Theme.of(context).textTheme.headlineSmall)),
                    IconButton(
                        tooltip: 'Close product',
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(Icons.close))
                  ]),
                  if (item.imageUrls.isNotEmpty || item.imageUrl.isNotEmpty)
                    SizedBox(
                        height: 190,
                        child: ListView(
                            scrollDirection: Axis.horizontal,
                            children: [
                              for (final url in item.imageUrls.isEmpty
                                  ? [item.imageUrl]
                                  : item.imageUrls)
                                Padding(
                                    padding: const EdgeInsets.only(right: 12),
                                    child: SizedBox(
                                        width: 190, child: KImage(url)))
                            ])),
                  Text('${item.packSize} ${item.unit} · ${rupee(item.price)}',
                      style: Theme.of(context).textTheme.titleLarge),
                  if (item.mrpPaise != null)
                    Text(
                        'MRP ${rupee(item.mrpPaise! / 100)} · Save ${rupee((item.mrpPaise! / 100 - item.price).clamp(0, double.infinity))}'),
                  if (item.sku != null) Text('SKU ${item.sku}'),
                  const SizedBox(height: 12),
                  Text(item.description),
                  const SizedBox(height: 16),
                  const Text('Choose a pack'),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    for (final variant in widget.variants)
                      ChoiceChip(
                          label: Text(
                              '${variant.packSize} ${variant.unit} · ${rupee(variant.price)}${variant.isAvailable ? '' : ' · Out of stock'}'),
                          selected: item.id == variant.id,
                          onSelected: (_) => setState(() {
                                item = variant;
                                quantity = 1;
                              }))
                  ]),
                  const SizedBox(height: 16),
                  Text(item.isAvailable
                      ? '${item.stockQty ?? ''} packs available'.trim()
                      : 'Out of stock'),
                  Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                    IconButton(
                        tooltip: 'Fewer packs',
                        onPressed: quantity > 1
                            ? () => setState(() => quantity--)
                            : null,
                        icon: const Icon(Icons.remove)),
                    Text('$quantity packs'),
                    IconButton(
                        tooltip: 'More packs',
                        onPressed: quantity < max
                            ? () => setState(() => quantity++)
                            : null,
                        icon: const Icon(Icons.add))
                  ]),
                  FilledButton(
                      onPressed: item.isAvailable && max > 0
                          ? () => Navigator.pop(context, (item, quantity))
                          : null,
                      child: Text(
                          'Add $quantity · ${rupee(item.price * quantity)}')),
                  const SizedBox(height: 20),
                ])));
  }
}
