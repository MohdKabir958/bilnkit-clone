import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../tokens/foundation.dart';

/// Every tappable surface in Grozo: springy scale-down + haptic tick.
class KPressable extends StatefulWidget {
  const KPressable(
      {super.key,
      required this.child,
      this.onTap,
      this.onLongPress,
      this.scale = 0.96,
      this.haptic = true,
      this.semanticLabel});
  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final double scale;
  final bool haptic;
  final String? semanticLabel;

  @override
  State<KPressable> createState() => _KPressableState();
}

class _KPressableState extends State<KPressable> {
  bool _down = false;
  bool _focused = false;

  void _set(bool v) {
    if (widget.onTap == null && widget.onLongPress == null) return;
    if (_down != v) setState(() => _down = v);
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      enabled: widget.onTap != null || widget.onLongPress != null,
      label: widget.semanticLabel,
      child: FocusableActionDetector(
          enabled: widget.onTap != null || widget.onLongPress != null,
          shortcuts: const {
            SingleActivator(LogicalKeyboardKey.enter): ActivateIntent(),
            SingleActivator(LogicalKeyboardKey.space): ActivateIntent()
          },
          actions: {
            ActivateIntent: CallbackAction<ActivateIntent>(onInvoke: (_) {
              widget.onTap?.call();
              return null;
            })
          },
          onShowFocusHighlight: (value) {
            if (_focused != value) setState(() => _focused = value);
          },
          child: DecoratedBox(
              decoration: BoxDecoration(
                  borderRadius:
                      BorderRadius.circular(KRadius.control.topLeft.x),
                  border: Border.all(
                      color: _focused
                          ? Theme.of(context).colorScheme.primary
                          : Colors.transparent,
                      width: 2)),
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapDown: (_) => _set(true),
                onTapCancel: () => _set(false),
                onTapUp: (_) => _set(false),
                onTap: widget.onTap == null
                    ? null
                    : () {
                        if (widget.haptic) HapticFeedback.selectionClick();
                        widget.onTap!();
                      },
                onLongPress: widget.onLongPress,
                child: AnimatedScale(
                  scale: _down && !MediaQuery.disableAnimationsOf(context)
                      ? widget.scale
                      : 1,
                  duration: MediaQuery.disableAnimationsOf(context)
                      ? Duration.zero
                      : (_down ? KMotion.fast : KMotion.base),
                  curve: _down ? Curves.easeOut : KMotion.spring,
                  child: widget.child,
                ),
              ))),
    );
  }
}
