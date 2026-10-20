// ignore_for_file: sort_child_properties_last
import 'package:flutter/material.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import '../models/menu_item.dart';
import 'ui/k_image.dart';
import 'ui/format.dart';
import 'ui/sheet_chrome.dart';

Future<(MenuItemModel, int)?> showProductDetails(
    BuildContext context, MenuItemModel item, List<MenuItemModel> items) {
  final variants = item.productKey == null
      ? [item]
      : items
          .where((p) =>
              p.vendorId == item.vendorId && p.productKey == item.productKey)
          .toList();
  return showKSheet<(MenuItemModel, int)>(context,
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
    final k = context.k;
    final max = (item.stockQty ?? 20).clamp(0, 20);
    final available = item.isAvailable && max > 0;
    final images = item.imageUrls.isEmpty ? [item.imageUrl] : item.imageUrls;
    return KSheetFrame(
        title: item.name,
        subtitle: Text('${item.packSize} ${item.unit}',
            style: KraveoType.bodySm.copyWith(color: k.inkMuted)),
        children: [
          SizedBox(
              height: 190,
              child: PageView(children: [
                for (final url in images)
                  Padding(
                      padding: const EdgeInsets.all(8),
                      child: ClipRRect(
                          borderRadius: KRadius.card,
                          child: KImage(url, fit: BoxFit.contain)))
              ])),
          const SizedBox(height: 16),
          Wrap(
              spacing: 12,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(rupee(item.price),
                    style: KraveoType.headline.copyWith(color: k.ink)),
                if (item.savings > 0)
                  Text('MRP ${rupee(item.mrpPaise! / 100)}',
                      style: KraveoType.bodySm.copyWith(
                          decoration: TextDecoration.lineThrough,
                          color: k.inkMuted))
              ]),
          if (item.savings > 0)
            Text('Save ${rupee(item.savings)} on this pack',
                style: KraveoType.bodySm.copyWith(color: k.success)),
          const SizedBox(height: 20),
          Text('Choose a pack', style: KraveoType.titleMd),
          const SizedBox(height: 10),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final variant in widget.variants)
              KChoiceChip(
                  label:
                      '${variant.packSize} ${variant.unit} · ${rupee(variant.price)}${variant.isAvailable && variant.stockQty != 0 ? '' : ' · Out of stock'}',
                  selected: item.id == variant.id,
                  onTap: () => setState(() {
                        item = variant;
                        quantity = 1;
                      }))
          ]),
          const SizedBox(height: 20),
          Text('About this product', style: KraveoType.titleMd),
          const SizedBox(height: 8),
          Text(
              item.description.isEmpty
                  ? 'Check the pack details before ordering. Availability is verified at checkout.'
                  : item.description,
              style: KraveoType.body.copyWith(color: k.inkMuted)),
          const SizedBox(height: 12),
          Text(
              available
                  ? item.stockQty == null
                      ? 'Available'
                      : '${item.stockQty} packs available'
                  : 'Out of stock',
              style: KraveoType.bodySm
                  .copyWith(color: available ? k.success : k.error)),
          if (item.sku != null)
            Text('SKU ${item.sku}',
                style: KraveoType.caption.copyWith(color: k.inkMuted)),
        ],
        footer: Column(mainAxisSize: MainAxisSize.min, children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text('Quantity', style: KraveoType.titleMd),
            Row(children: [
              IconButton(
                  tooltip: 'Fewer packs',
                  onPressed:
                      quantity > 1 ? () => setState(() => quantity--) : null,
                  icon: const Icon(Icons.remove)),
              Text('$quantity', style: KraveoType.titleMd),
              IconButton(
                  tooltip: 'More packs',
                  onPressed: available && quantity < max
                      ? () => setState(() => quantity++)
                      : null,
                  icon: const Icon(Icons.add))
            ])
          ]),
          const SizedBox(height: 8),
          KButton(
              label: available
                  ? 'Add $quantity · ${rupee(item.price * quantity)}'
                  : 'Out of stock',
              icon: Icons.shopping_bag_outlined,
              onPressed: available
                  ? () => Navigator.pop(context, (item, quantity))
                  : null),
        ]));
  }
}
