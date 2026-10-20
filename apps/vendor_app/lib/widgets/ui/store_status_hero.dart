import 'package:flutter/material.dart';
import 'package:kraveo_ui/kraveo_ui.dart';

/// Store availability remains controlled by the existing confirmed server action.
class VStoreStatusHero extends StatelessWidget {
  const VStoreStatusHero(
      {super.key, required this.isOpen, required this.onTap, this.storeName});
  final bool isOpen;
  final VoidCallback onTap;
  final String? storeName;
  @override
  Widget build(BuildContext context) {
    final k = context.k;
    return Semantics(
        button: true,
        label: isOpen
            ? 'Store is open. Double tap to close the store.'
            : 'Store is closed. Double tap to open the store.',
        excludeSemantics: true,
        child: Material(
            color: isOpen ? k.brandSoft : k.surfaceAlt,
            shape: RoundedRectangleBorder(
                borderRadius: KRadius.card, side: BorderSide(color: k.line)),
            child: InkWell(
                borderRadius: KRadius.card,
                onTap: onTap,
                child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(children: [
                      Icon(Icons.storefront_outlined,
                          color: isOpen ? k.brand : k.inkMuted, size: 28),
                      const SizedBox(width: 12),
                      Expanded(
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                            Wrap(spacing: 8, children: [
                              Text(isOpen ? 'OPEN' : 'CLOSED',
                                  style: KraveoType.titleLg.copyWith(
                                      color: isOpen ? k.brand : k.ink)),
                              Text(isOpen ? 'खुला' : 'बंद',
                                  style: KraveoType.titleMd
                                      .copyWith(color: k.inkMuted))
                            ]),
                            const SizedBox(height: 4),
                            Text(
                                isOpen
                                    ? 'Accepting orders · Tap to close'
                                    : 'Orders paused · Tap to open',
                                style: KraveoType.bodySm
                                    .copyWith(color: k.inkMuted))
                          ])),
                      const SizedBox(width: 12),
                      Icon(Icons.power_settings_new,
                          color: isOpen ? k.brand : k.inkMuted, size: 28),
                    ])))));
  }
}
