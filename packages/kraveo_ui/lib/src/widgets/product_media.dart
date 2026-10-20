import 'package:flutter/material.dart';
import '../theme/tokens.dart';

/// Owned product imagery, contained and decoded to the displayed size.
class KProductMedia extends StatelessWidget {
  const KProductMedia(
      {super.key, required this.url, this.label = 'Product image'});
  final String url, label;
  @override
  Widget build(BuildContext context) {
    final k = context.k;
    Widget fallback() => ColoredBox(
        color: k.brandSoft,
        child: Center(
            child: Icon(Icons.inventory_2_outlined, size: 28, color: k.brand)));
    return Semantics(
        image: true,
        label: label,
        child: ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: LayoutBuilder(builder: (context, box) {
              if (url.trim().isEmpty) return fallback();
              final pixels = ((box.hasBoundedWidth ? box.maxWidth : 160) *
                      MediaQuery.devicePixelRatioOf(context))
                  .ceil()
                  .clamp(100, 1200);
              return ColoredBox(
                  color: k.surfaceAlt,
                  child: Image(
                      image: ResizeImage(NetworkImage(url),
                          width: pixels,
                          height: pixels,
                          policy: ResizeImagePolicy.fit),
                      fit: BoxFit.contain,
                      width: double.infinity,
                      height: double.infinity,
                      errorBuilder: (_, __, ___) => fallback()));
            })));
  }
}
