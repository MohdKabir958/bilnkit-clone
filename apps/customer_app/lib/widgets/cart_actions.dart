import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../models/dhaba.dart';
import '../models/menu_item.dart';
import '../providers/cart_provider.dart';
import 'customization_modal.dart';
import 'ui/sheet_chrome.dart';
import 'ui/snack.dart';

/// Shared by Home and the store catalog; preserves the existing cart contract.
Future<bool> addProduct(BuildContext context, CartProvider cart, Dhaba store,
    MenuItemModel item) async {
  if (!item.isAvailable || item.stockQty == 0) {
    showKSnack(context, 'This product is out of stock.', error: true);
    return false;
  }
  if (item.stockQty != null &&
      cart.getItemQuantityInCart(item.id) >= item.stockQty!) {
    showKSnack(context,
        'No more packs are available. Refresh this store to check stock.',
        error: true);
    return false;
  }
  if (!store.isAcceptingOrders) {
    showKSnack(context, '${store.name} is not taking orders right now.',
        error: true);
    return false;
  }
  if (!cart.canAddMore(item.id) && cart.hasRestaurant(store.id)) {
    showKSnack(context, CartProvider.maxQuantityMessage,
        icon: LucideIcons.info);
    return false;
  }
  if (cart.wouldReplaceCart(store.id)) {
    final replace = await showKConfirm(context,
        title: 'Start a new cart?',
        message: 'Your cart has items from another store. Start a new cart?',
        confirmLabel: 'Start new cart',
        cancelLabel: 'Keep my cart');
    if (replace != true || !context.mounted) return false;
  } else if (!cart.canAddRestaurant(store.id)) {
    showKSnack(context, cart.maxRestaurantsMessage, icon: LucideIcons.info);
    return false;
  }
  if (item.hasCustomizations) {
    CustomizationModal.show(context,
        item: item,
        onAddToCart: (options, notes) => cart.addItem(
            item: item,
            dhabaId: store.id,
            dhabaName: store.name,
            selectedOptions: options,
            specialInstructions: notes));
    return false;
  }
  cart.addItem(item: item, dhabaId: store.id, dhabaName: store.name);
  return true;
}

void removeProduct(CartProvider cart, MenuItemModel item) {
  final lines = cart.items.where((line) => line.item.id == item.id);
  if (lines.isNotEmpty) cart.decrementItem(lines.last.cartItemId);
}
