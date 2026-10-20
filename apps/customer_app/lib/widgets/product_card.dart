import 'package:flutter/material.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import '../models/menu_item.dart';
import 'ui/add_stepper.dart';
import 'ui/format.dart';
import 'ui/k_image.dart';

/// Grocery SKU, not a recommendation or an invented promotion.
class ProductCard extends StatelessWidget {
  const ProductCard(
      {super.key,
      required this.item,
      required this.storeName,
      required this.quantity,
      required this.onDetails,
      required this.onAdd,
      required this.onRemove,
      this.open = true});
  final MenuItemModel item;
  final String storeName;
  final int quantity;
  final bool open;
  final VoidCallback onDetails, onAdd, onRemove;
  @override
  Widget build(BuildContext context) {
    final k = context.k;
    final available = open && item.isAvailable && item.stockQty != 0;
    final saving = item.savings;
    return Container(
      decoration: BoxDecoration(
          color: k.surface,
          borderRadius: KRadius.card,
          border: Border.all(color: k.line)),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Expanded(
            child: InkWell(
                onTap: onDetails,
                child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                              child: Semantics(
                                  label: '${item.name}, product image',
                                  image: true,
                                  child: ClipRRect(
                                      borderRadius: BorderRadius.circular(8),
                                      child: KImage(item.primaryImage,
                                          fit: BoxFit.contain,
                                          grayscale: !available)))),
                          const SizedBox(height: 10),
                          if (saving > 0)
                            Text('SAVE ${rupee(saving)}',
                                style: KraveoType.caption.copyWith(
                                    color: k.success,
                                    fontWeight: FontWeight.w700)),
                          Text(item.name,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: KraveoType.titleMd
                                  .copyWith(color: k.ink, fontSize: 14)),
                          const SizedBox(height: 4),
                          Text('${item.packSize} ${item.unit}',
                              style: KraveoType.bodySm
                                  .copyWith(color: k.inkMuted)),
                          Text(storeName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: KraveoType.caption
                                  .copyWith(color: k.inkMuted)),
                        ])))),
        Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: Wrap(
                spacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(rupee(item.price),
                      style: KraveoType.titleMd.copyWith(color: k.ink)),
                  if (saving > 0)
                    Text(rupee(item.mrpPaise! / 100),
                        style: KraveoType.caption.copyWith(
                            color: k.inkMuted,
                            decoration: TextDecoration.lineThrough)),
                ])),
        Padding(
            padding: const EdgeInsets.fromLTRB(8, 0, 8, 12),
            child: available || quantity > 0
                ? KAddButton(
                    quantity: quantity,
                    itemName: item.name,
                    enabled: available,
                    onAdd: onAdd,
                    onRemove: onRemove)
                : SizedBox(
                    height: 44,
                    child: Center(
                        child: Text(open ? 'Out of stock' : 'Store closed',
                            style: KraveoType.caption
                                .copyWith(color: k.inkMuted))))),
      ]),
    );
  }
}

int productColumns(BuildContext context, double width) =>
    MediaQuery.textScalerOf(context).scale(14) > 20 || width < 300
        ? 1
        : (width / 176).floor().clamp(2, 4);
double productExtent(BuildContext context) =>
    324 + (MediaQuery.textScalerOf(context).scale(14) - 14).clamp(0, 28) * 10;
