import 'package:flutter/material.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import '../providers/cart_provider.dart';
import 'cart_sheet.dart';
import 'ui/format.dart';

class CartSummaryBar extends StatelessWidget {
  const CartSummaryBar({super.key, required this.cart, this.address});
  final CartProvider cart;
  final String? address;
  @override
  Widget build(BuildContext context) {
    final k = context.k;
    return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Material(
            color: k.brand,
            borderRadius: KRadius.control,
            child: InkWell(
                borderRadius: KRadius.control,
                onTap: () => CartSheet.show(context, selectedHostel: address),
                child: Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 14),
                    child: Row(children: [
                      Expanded(
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                            Text(
                                '${cart.itemCount} items · ${rupee(cart.subtotal)}',
                                style: KraveoType.titleMd
                                    .copyWith(color: k.onBrand)),
                            Text('Items subtotal · Fees at checkout',
                                style: KraveoType.caption
                                    .copyWith(color: k.onBrand))
                          ])),
                      const SizedBox(width: 12),
                      Text('View cart',
                          style: KraveoType.button.copyWith(color: k.onBrand)),
                      const SizedBox(width: 4),
                      Icon(Icons.arrow_forward, color: k.onBrand, size: 18),
                    ])))));
  }
}
