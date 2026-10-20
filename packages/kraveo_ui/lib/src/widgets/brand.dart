import 'package:flutter/material.dart';
import '../theme/tokens.dart';
import '../tokens/colors.dart';
import '../brand_config.dart';

/// The shared Grozo wordmark. A light badge keeps it readable on dark surfaces.
class KBrandMark extends StatelessWidget {
  const KBrandMark({super.key, this.height = 56});
  final double height;

  @override
  Widget build(BuildContext context) {
    final Widget img = BrandConfig.logoAsset.isEmpty
        ? SizedBox(width: height * 1.6, height: height, child: FittedBox(fit: BoxFit.scaleDown, child: Text(BrandConfig.name, style: TextStyle(fontSize: height * 0.4, fontWeight: FontWeight.w800, color: KraveoPalette.g800))))
        : Image.asset(BrandConfig.logoAsset, package: 'kraveo_ui', height: height, fit: BoxFit.contain, semanticLabel: BrandConfig.name);
    if (!context.k.isDark) return img;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: height * 0.22, vertical: height * 0.12),
      decoration: BoxDecoration(color: KraveoPalette.cream, borderRadius: BorderRadius.circular(height * 0.36)),
      child: img,
    );
  }
}
