import 'package:flutter/material.dart';
import '../theme/tokens.dart';
import '../tokens/typography.dart';

class KNavItem {
  const KNavItem(this.icon, this.label, {this.badge = 0});
  final IconData icon;
  final String label;
  final int badge;
}

/// Stable destinations with labels always visible. Public name retained for compatibility.
class KGlassNav extends StatelessWidget {
  const KGlassNav(
      {super.key,
      required this.items,
      required this.index,
      required this.onChanged,
      this.dense = false});
  final bool dense;
  final List<KNavItem> items;
  final int index;
  final ValueChanged<int> onChanged;
  @override
  Widget build(BuildContext context) {
    final k = context.k;
    return DecoratedBox(
      decoration: BoxDecoration(
          color: k.surface, border: Border(top: BorderSide(color: k.line))),
      child: SafeArea(
          top: false,
          child: Padding(
            padding:
                EdgeInsets.symmetric(horizontal: 8, vertical: dense ? 0 : 6),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              for (var i = 0; i < items.length; i++)
                Expanded(
                    child: Semantics(
                  selected: index == i,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => onChanged(i),
                    child: Padding(
                        padding: EdgeInsets.symmetric(
                            horizontal: 2, vertical: dense ? 3 : 8),
                        child:
                            Column(mainAxisSize: MainAxisSize.min, children: [
                          Container(
                              padding: EdgeInsets.symmetric(
                                  horizontal: 18, vertical: dense ? 1 : 5),
                              decoration: BoxDecoration(
                                  color: index == i
                                      ? k.brandSoft
                                      : Colors.transparent,
                                  borderRadius: BorderRadius.circular(12)),
                              child: Badge(
                                isLabelVisible: items[i].badge > 0,
                                label: Text('${items[i].badge}'),
                                backgroundColor: k.accent,
                                textColor: k.onAccent,
                                child: Icon(items[i].icon,
                                    size: 22,
                                    color: index == i ? k.brand : k.inkMuted),
                              )),
                          const SizedBox(height: 4),
                          Text(items[i].label,
                              textAlign: TextAlign.center,
                              style: KraveoType.caption.copyWith(
                                  fontSize: dense ? 10 : null,
                                  color: index == i ? k.brand : k.inkMuted,
                                  fontWeight: index == i
                                      ? FontWeight.w700
                                      : FontWeight.w500)),
                        ])),
                  ),
                )),
            ]),
          )),
    );
  }
}
