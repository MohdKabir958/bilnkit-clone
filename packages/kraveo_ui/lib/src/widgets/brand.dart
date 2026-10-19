import 'package:flutter/material.dart';
import '../theme/tokens.dart';
import '../tokens/colors.dart';
import '../brand_config.dart';

/// The Kraveo bowl mark (transparent PNG). On dark surfaces the green wordmark would vanish,
/// so it sits on a soft cream badge automatically.
class KBrandMark extends StatelessWidget {
  const KBrandMark({super.key, this.height = 56});
  final double height;

  @override
  Widget build(BuildContext context) {
    // No inherited commercial artwork is used unless a reviewed asset is configured.
    final Widget img = BrandConfig.logoAsset.isEmpty
        ? SizedBox(width: height * 1.6, height: height, child: FittedBox(fit: BoxFit.scaleDown, child: Text(BrandConfig.name, style: TextStyle(fontSize: height * 0.4, fontWeight: FontWeight.w800, color: KraveoPalette.g800))))
        : Image.asset(BrandConfig.logoAsset, package: 'kraveo_ui', height: height, fit: BoxFit.contain);
    if (!context.k.isDark) return img;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: height * 0.22, vertical: height * 0.12),
      decoration: BoxDecoration(color: KraveoPalette.cream, borderRadius: BorderRadius.circular(height * 0.36)),
      child: img,
    );
  }
}
