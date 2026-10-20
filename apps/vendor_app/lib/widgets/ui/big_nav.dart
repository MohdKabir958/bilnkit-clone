import 'package:flutter/material.dart';
import 'package:kraveo_ui/kraveo_ui.dart';

class VNavItem {
  const VNavItem(
      {required this.icon,
      required this.label,
      required this.hindi,
      this.badge = 0});
  final IconData icon;
  final String label, hindi;
  final int badge;
}

class VBigNav extends StatelessWidget {
  const VBigNav(
      {super.key,
      required this.items,
      required this.index,
      required this.onChanged});
  final List<VNavItem> items;
  final int index;
  final ValueChanged<int> onChanged;
  @override
  Widget build(BuildContext context) => KGlassNav(items: [
        for (final item in items)
          KNavItem(item.icon, item.label, badge: item.badge)
      ], index: index, onChanged: onChanged);
}
