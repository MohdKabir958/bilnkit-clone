import 'package:flutter/material.dart';
import '../../providers/cart_provider.dart';

/// Compatibility widget for older imports. Rewards redemption has no checkout API.
/// Keep financial state in CartProvider; expose no unfinished user controls.
class CoinsBalance extends StatelessWidget {
  const CoinsBalance({super.key, required this.cart});
  final CartProvider cart;
  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
