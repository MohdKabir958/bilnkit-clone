import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../models/dhaba.dart';
import '../models/grocery_department.dart';
import '../models/menu_item.dart';
import 'ui/format.dart';
import 'ui/k_image.dart';

const groceryGreen = Color(0xFF16844B);
const groceryCanvas = Color(0xFFF5FAF7);
TextStyle groceryText(double size,
        {FontWeight weight = FontWeight.w500,
        Color color = const Color(0xFF14261F)}) =>
    KraveoType.body.copyWith(
        fontSize: size,
        fontWeight: weight,
        color: color,
        height: 1.15,
        letterSpacing: 0);

class GroceryHeader extends StatelessWidget {
  const GroceryHeader(
      {super.key,
      required this.address,
      required this.cartCount,
      required this.search,
      required this.onSearch,
      required this.onClear,
      required this.onAddress,
      required this.onCart,
      required this.onSaved});
  final String address;
  final int cartCount;
  final TextEditingController search;
  final ValueChanged<String> onSearch;
  final VoidCallback onClear, onAddress, onCart, onSaved;
  @override
  Widget build(BuildContext context) => Container(
      padding:
          EdgeInsets.fromLTRB(14, MediaQuery.viewPaddingOf(context).top, 14, 5),
      decoration: const BoxDecoration(
          gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Color(0xFF147948),
                Color(0xFF1A8B51),
                Color(0xFF4F9B68)
              ]),
          borderRadius: BorderRadius.only(
              bottomLeft: Radius.circular(28),
              bottomRight: Radius.circular(28))),
      child: Column(children: [
        Row(children: [
          const SizedBox(
              width: 26, height: 28, child: CustomPaint(painter: _LeafMark())),
          const SizedBox(width: 6),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text('Grozo',
                    style: groceryText(23,
                        weight: FontWeight.w800, color: Colors.white)),
                Text('Freshness Delivered',
                    style: groceryText(9,
                        color: Colors.white.withValues(alpha: .9)))
              ])),
          IconButton(
              tooltip: 'Saved stores and products',
              constraints: const BoxConstraints(minWidth: 40, minHeight: 36),
              padding: const EdgeInsets.all(6),
              onPressed: onSaved,
              icon:
                  const Icon(LucideIcons.heart, color: Colors.white, size: 22)),
          IconButton(
              tooltip: 'Open cart',
              constraints: const BoxConstraints(minWidth: 40, minHeight: 36),
              padding: const EdgeInsets.all(6),
              onPressed: onCart,
              icon: Badge(
                  isLabelVisible: cartCount > 0,
                  label: Text('$cartCount'),
                  backgroundColor: const Color(0xFFBFE9A9),
                  textColor: const Color(0xFF145A31),
                  child: const Icon(LucideIcons.shoppingCart,
                      color: Colors.white, size: 23))),
        ]),
        const SizedBox(height: 2),
        Material(
            color: const Color(0xFFD9F3DE),
            borderRadius: BorderRadius.circular(14),
            child: InkWell(
                borderRadius: BorderRadius.circular(14),
                onTap: onAddress,
                child: Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    child: Row(children: [
                      const Icon(Icons.location_on,
                          color: groceryGreen, size: 21),
                      const SizedBox(width: 8),
                      Expanded(
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                            Text('Delivering to',
                                style: groceryText(8.5,
                                    color: const Color(0xFF42684D))),
                            Text(address,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: groceryText(11, weight: FontWeight.w700))
                          ])),
                      const Icon(LucideIcons.chevronDown, size: 15)
                    ])))),
        const SizedBox(height: 6),
        ValueListenableBuilder<TextEditingValue>(
            valueListenable: search,
            builder: (context, value, _) => TextField(
                controller: search,
                onChanged: onSearch,
                textInputAction: TextInputAction.search,
                style: groceryText(11),
                decoration: InputDecoration(
                  hintText: 'Search for products, stores, groceries...',
                  hintStyle: groceryText(10.5, color: const Color(0xFF85958E)),
                  isDense: true,
                  filled: true,
                  fillColor: Colors.white,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                  prefixIcon: const Icon(LucideIcons.search,
                      size: 17, color: Color(0xFF63766C)),
                  prefixIconConstraints:
                      const BoxConstraints(minWidth: 34, minHeight: 32),
                  suffixIcon: value.text.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Clear search',
                          onPressed: onClear,
                          icon: const Icon(LucideIcons.x, size: 15)),
                  suffixIconConstraints:
                      const BoxConstraints(minWidth: 32, minHeight: 32),
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide.none),
                  enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide.none),
                  focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: Color(0xFF9EDAB6))),
                ))),
      ]));
}

class _LeafMark extends CustomPainter {
  const _LeafMark();
  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 32, size.height / 32);
    final paint = Paint()..color = Colors.white;
    canvas.drawPath(
        Path()
          ..moveTo(14, 27)
          ..cubicTo(2, 25, 1, 18, 1, 11)
          ..cubicTo(12, 11, 17, 17, 14, 27)
          ..close(),
        paint);
    canvas.drawPath(
        Path()
          ..moveTo(17, 24)
          ..cubicTo(12, 11, 20, 4, 31, 1)
          ..cubicTo(31, 14, 27, 23, 17, 24)
          ..close(),
        paint);
    canvas.drawPath(
        Path()
          ..moveTo(14, 30)
          ..quadraticBezierTo(17, 22, 25, 11)
          ..lineTo(17, 28)
          ..close(),
        paint);
  }

  @override
  bool shouldRepaint(_LeafMark oldDelegate) => false;
}

class GrocerySectionTitle extends StatelessWidget {
  const GrocerySectionTitle(this.title,
      {super.key, required this.onViewAll, this.actionKey});
  final String title;
  final VoidCallback onViewAll;
  final Key? actionKey;
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.fromLTRB(14, 7, 8, 3),
      child: Row(children: [
        Expanded(
            child:
                Text(title, style: groceryText(14, weight: FontWeight.w800))),
        TextButton(
            key: actionKey,
            onPressed: onViewAll,
            style: TextButton.styleFrom(
                minimumSize: const Size(56, 18),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 0),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Text('View All', style: groceryText(9.5, color: groceryGreen)),
              const SizedBox(width: 4),
              const Icon(LucideIcons.chevronRight,
                  size: 14, color: Color(0xFF283D32))
            ]))
      ]));
}

class NearbyStoreTile extends StatelessWidget {
  const NearbyStoreTile(
      {super.key,
      required this.store,
      required this.onTap,
      this.bestChoice = false,
      this.illustration = 0});
  final Dhaba store;
  final VoidCallback onTap;
  final bool bestChoice;
  final int illustration;
  @override
  Widget build(BuildContext context) => Material(
      elevation: 1,
      shadowColor: const Color(0x0A16462C),
      color: Colors.white,
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(
              color: bestChoice ? groceryGreen : const Color(0xFFE8EFEB),
              width: bestChoice ? 1.1 : 1)),
      child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Stack(children: [
            Padding(
                padding: const EdgeInsets.fromLTRB(8, 8, 8, 7),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Center(
                          child: Container(
                              width: 34,
                              height: 34,
                              decoration: const BoxDecoration(
                                  color: Color(0xFFE8F7E4),
                                  shape: BoxShape.circle),
                              child: Icon(
                                  [
                                    Icons.storefront,
                                    Icons.storefront,
                                    LucideIcons.shoppingCart,
                                    LucideIcons.leaf
                                  ][illustration % 4],
                                  color: const Color(0xFF17933E),
                                  size: 27))),
                      const SizedBox(height: 4),
                      Expanded(
                          child: Center(
                              child: Text(store.name,
                                  textAlign: TextAlign.center,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: groceryText(10.5,
                                      weight: FontWeight.w700)))),
                      Row(children: [
                        Container(
                            width: 6,
                            height: 6,
                            decoration: BoxDecoration(
                                color: store.isAcceptingOrders
                                    ? const Color(0xFF22B76B)
                                    : const Color(0xFF87948D),
                                shape: BoxShape.circle)),
                        const SizedBox(width: 4),
                        Flexible(
                            child: Text(
                                store.isAcceptingOrders ? 'Open' : 'Closed',
                                style: groceryText(9,
                                    color: store.isAcceptingOrders
                                        ? groceryGreen
                                        : const Color(0xFF697C71))))
                      ]),
                      const SizedBox(height: 4),
                      Row(children: [
                        const Icon(LucideIcons.mapPin,
                            size: 9, color: Color(0xFF57947A)),
                        const SizedBox(width: 3),
                        Expanded(
                            child: Text(
                                store.distanceKm == null
                                    ? 'Distance unavailable'
                                    : '${store.distanceKm!.toStringAsFixed(1)} km',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: groceryText(8.5,
                                    color: const Color(0xFF69857A)))),
                        const Icon(LucideIcons.chevronRight,
                            size: 12, color: Color(0xFF3F8D6A))
                      ]),
                    ])),
            if (bestChoice)
              Positioned(
                  top: 0,
                  left: 0,
                  child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: const BoxDecoration(
                          color: groceryGreen,
                          borderRadius: BorderRadius.only(
                              topLeft: Radius.circular(11),
                              bottomRight: Radius.circular(9))),
                      child: Text('Best Choice',
                          style: groceryText(7, color: Colors.white)))),
          ])));
}

class GroceryCategoryTile extends StatelessWidget {
  const GroceryCategoryTile(
      {super.key, required this.department, required this.onTap});
  final GroceryDepartment department;
  final VoidCallback onTap;
  static const colors = [
    Color(0xFFEAF6D9),
    Color(0xFFE3F4FE),
    Color(0xFFFFF2CC),
    Color(0xFFFFE6D4),
    Color(0xFFEFE3FC),
    Color(0xFFE5F5D5),
    Color(0xFFFFEBCB),
    Color(0xFFFFE3E8),
    Color(0xFFE2F7FF),
    Color(0xFFE7EDFF)
  ];
  @override
  Widget build(BuildContext context) => Material(
      elevation: 1,
      shadowColor: const Color(0x0A16462C),
      color: Colors.white,
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: Color(0xFFE8EFEB))),
      child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 6),
              child: Column(children: [
                Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                        color: colors[department.sprite],
                        shape: BoxShape.circle),
                    padding: const EdgeInsets.all(1),
                    child: DepartmentArtwork(index: department.sprite)),
                const SizedBox(height: 5),
                Expanded(
                    child: Center(
                        child: Text(department.label,
                            textAlign: TextAlign.center,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: groceryText(9, weight: FontWeight.w700))))
              ]))));
}

/// One checked-in original atlas, decoded once; no remote icon dependencies or per-tile duplicates.
class DepartmentArtwork extends StatelessWidget {
  const DepartmentArtwork({super.key, required this.index});
  final int index;
  @override
  Widget build(BuildContext context) =>
      Image.asset('assets/catalog/category-atlas.png',
          cacheWidth: 1000, excludeFromSemantics: true,
          frameBuilder: (context, child, frame, sync) {
        if (child is RawImage && child.image != null) {
          return CustomPaint(painter: _AtlasPainter(child.image!, index));
        }
        return const SizedBox();
      });
}

class _AtlasPainter extends CustomPainter {
  _AtlasPainter(this.atlas, this.index);
  final ui.Image atlas;
  final int index;
  @override
  void paint(Canvas canvas, Size size) {
    final w = atlas.width / 5, h = atlas.height / 2;
    final cell = Rect.fromLTWH((index % 5) * w, (index ~/ 5) * h, w, h);
    final rect =
        Rect.fromCenter(center: cell.center, width: w * .84, height: h * .9);
    canvas.drawImageRect(atlas, rect, Offset.zero & size,
        Paint()..filterQuality = FilterQuality.high);
  }

  @override
  bool shouldRepaint(_AtlasPainter old) =>
      old.atlas != atlas || old.index != index;
}

class GroceryProductCard extends StatelessWidget {
  const GroceryProductCard(
      {super.key,
      required this.item,
      required this.storeName,
      required this.quantity,
      required this.onDetails,
      required this.onAdd,
      required this.onRemove,
      required this.onFavorite,
      this.saved = false,
      this.open = true});
  final MenuItemModel item;
  final String storeName;
  final int quantity;
  final VoidCallback onDetails, onAdd, onRemove, onFavorite;
  final bool saved, open;
  @override
  Widget build(BuildContext context) {
    final available = open && item.isAvailable && item.stockQty != 0;
    return Material(
        elevation: 1,
        shadowColor: const Color(0x0A16462C),
        color: Colors.white,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: const BorderSide(color: Color(0xFFE8EFEB))),
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Expanded(
              child: Stack(children: [
            Positioned.fill(
                child: InkWell(
                    onTap: onDetails,
                    child: Padding(
                        padding: const EdgeInsets.fromLTRB(8, 6, 24, 7),
                        child: KImage(item.primaryImage,
                            fit: BoxFit.contain,
                            backgroundColor: Colors.white,
                            zoom: 1.3,
                            alignment: Alignment.centerLeft,
                            grayscale: !available)))),
            Positioned(
                top: 0,
                right: 0,
                child: IconButton(
                    tooltip: saved
                        ? 'Remove ${item.name} from saved products'
                        : 'Save ${item.name}',
                    onPressed: onFavorite,
                    visualDensity: VisualDensity.compact,
                    icon: Icon(saved ? Icons.favorite : LucideIcons.heart,
                        size: 15,
                        color:
                            saved ? groceryGreen : const Color(0xFF37483E)))),
            if (item.savings > 0)
              Positioned(
                  left: 8,
                  bottom: 0,
                  child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 5, vertical: 2),
                      decoration: BoxDecoration(
                          color: groceryGreen,
                          borderRadius: BorderRadius.circular(5)),
                      child: Text('SAVE ${rupee(item.savings)}',
                          style: groceryText(7.5,
                              weight: FontWeight.w700, color: Colors.white)))),
          ])),
          InkWell(
              onTap: onDetails,
              child: Padding(
                  padding: const EdgeInsets.fromLTRB(8, 3, 8, 0),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(item.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: groceryText(10.5, weight: FontWeight.w700)),
                        Text('${item.packSize} ${item.unit}',
                            style: groceryText(9.5,
                                color: const Color(0xFF77847D))),
                        Text(storeName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: groceryText(8.7,
                                color: const Color(0xFF5B9880))),
                        const SizedBox(height: 2),
                        Wrap(
                            crossAxisAlignment: WrapCrossAlignment.center,
                            spacing: 5,
                            children: [
                              Text(rupee(item.price),
                                  style:
                                      groceryText(13, weight: FontWeight.w800)),
                              if (item.savings > 0)
                                Text(rupee(item.mrpPaise! / 100),
                                    style: groceryText(8,
                                            color: const Color(0xFF809087))
                                        .copyWith(
                                            decoration:
                                                TextDecoration.lineThrough))
                            ])
                      ]))),
          Padding(
              padding: const EdgeInsets.fromLTRB(8, 3, 8, 6),
              child: Container(
                  height: 24,
                  decoration: BoxDecoration(
                      border: Border.all(
                          color: available || quantity > 0
                              ? const Color(0xFF62A984)
                              : const Color(0xFFDCE4DF)),
                      borderRadius: BorderRadius.circular(8)),
                  child: quantity > 0
                      ? Row(children: [
                          Expanded(
                              child: InkWell(
                                  onTap: onRemove,
                                  child: Semantics(
                                      label: 'Remove one ${item.name}',
                                      button: true,
                                      child: const Center(
                                          child: Icon(LucideIcons.minus,
                                              size: 13,
                                              color: groceryGreen))))),
                          Text('$quantity',
                              style: groceryText(11,
                                  weight: FontWeight.w700,
                                  color: groceryGreen)),
                          Expanded(
                              child: InkWell(
                                  onTap: onAdd,
                                  child: Semantics(
                                      label: 'Add one more ${item.name}',
                                      button: true,
                                      child: const Center(
                                          child: Icon(LucideIcons.plus,
                                              size: 13, color: groceryGreen)))))
                        ])
                      : InkWell(
                          onTap: available ? onAdd : null,
                          child: Semantics(
                              label: available
                                  ? 'Add ${item.name}'
                                  : open
                                      ? '${item.name} out of stock'
                                      : 'Store closed',
                              button: true,
                              child: Center(
                                  child: available
                                      ? Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                              const Icon(
                                                  LucideIcons.shoppingCart,
                                                  size: 11,
                                                  color: groceryGreen),
                                              const SizedBox(width: 7),
                                              Text('ADD +',
                                                  style: groceryText(9,
                                                      weight: FontWeight.w800,
                                                      color: groceryGreen))
                                            ])
                                      : Text(
                                          open
                                              ? 'Out of stock'
                                              : 'Store closed',
                                          style: groceryText(9,
                                              color: const Color(
                                                  0xFF78877E)))))))),
        ]));
  }
}
