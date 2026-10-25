import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/dhaba.dart';
import '../models/menu_item.dart';
import '../providers/cart_provider.dart';
import '../providers/dhaba_provider.dart';
import 'cart_actions.dart';
import 'product_card.dart';
import 'product_details.dart';

/// The reference card uses the same stock, customization and single-store cart safeguards.
Widget groceryProduct(BuildContext context, MenuItemModel item, Dhaba store) {
  final cart = context.watch<CartProvider>();
  final catalog = context.watch<DhabaProvider>();
  return ProductCard(
      key: ValueKey('grocery-product-${item.id}'),
      item: item,
      storeName: store.name,
      quantity: cart.getItemQuantityInCart(item.id),
      open: store.isAcceptingOrders,
      compact: true,
      saved: catalog.isProductSaved(item.id),
      onFavorite: () => catalog.toggleProductSaved(item.id),
      onAdd: () => addProduct(context, cart, store, item),
      onRemove: () => removeProduct(cart, item),
      onDetails: () async {
        final picked = await showProductDetails(
            context, item, catalog.getMenuItemsForDhaba(store.id));
        if (picked == null || !context.mounted) return;
        for (var n = 0; n < picked.$2; n++) {
          if (!await addProduct(context, cart, store, picked.$1) ||
              !context.mounted) {
            break;
          }
        }
      });
}

int groceryColumns(BuildContext context, double width) =>
    MediaQuery.textScalerOf(context).scale(12) > 18 || width < 290
        ? 1
        : width > 700
            ? 4
            : 2;
double groceryExtent(BuildContext context) =>
    144 + (MediaQuery.textScalerOf(context).scale(12) - 12).clamp(0, 24) * 8;
