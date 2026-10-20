import 'package:flutter/material.dart';
import 'package:kraveo_ui/kraveo_ui.dart';

class DutyToggle extends StatelessWidget {
  const DutyToggle(
      {super.key,
      required this.isOnline,
      required this.onChanged,
      this.busy = false,
      this.alertsOff = false});
  final bool isOnline, busy, alertsOff;
  final ValueChanged<bool> onChanged;
  @override
  Widget build(BuildContext context) {
    final k = context.k;
    return Semantics(
        toggled: isOnline,
        child: KPressable(
          semanticLabel: busy
              ? 'Going on duty, waiting for ${BrandConfig.name}.'
              : isOnline
                  ? 'You are on duty. Double tap to go off duty.'
                  : 'You are off duty. Double tap to go on duty.',
          onTap: busy ? null : () => onChanged(!isOnline),
          child: Container(
              constraints: const BoxConstraints(minHeight: 104),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                  color: isOnline ? k.brandSoft : k.surface,
                  borderRadius: KRadius.card,
                  border: Border.all(color: isOnline ? k.brand : k.line)),
              child: Row(children: [
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(
                          busy
                              ? 'CONNECTING'
                              : isOnline
                                  ? 'ON DUTY'
                                  : 'OFF DUTY',
                          style: KraveoType.headline
                              .copyWith(color: isOnline ? k.brand : k.ink)),
                      const SizedBox(height: 6),
                      Text(
                          busy
                              ? 'Waiting for server confirmation…'
                              : isOnline
                                  ? alertsOff
                                      ? 'Alerts are off - you may miss orders'
                                      : 'Ready for nearby delivery offers'
                                  : 'Go online when you are ready',
                          style: KraveoType.bodySm.copyWith(color: k.inkMuted)),
                    ])),
                const SizedBox(width: 12),
                Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                        color: isOnline ? k.brand : k.surfaceAlt,
                        borderRadius: BorderRadius.circular(16)),
                    child: busy
                        ? Padding(
                            padding: const EdgeInsets.all(16),
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: k.brand))
                        : Icon(Icons.power_settings_new,
                            color: isOnline ? k.onBrand : k.inkMuted,
                            size: 28)),
              ])),
        ));
  }
}
