import 'package:flutter/material.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import '../models/dhaba.dart';
import 'ui/format.dart';
import 'ui/k_image.dart';

class DhabaCard extends StatelessWidget {
  const DhabaCard(
      {super.key,
      required this.dhaba,
      required this.onTap,
      this.onFavoriteToggle});
  final Dhaba dhaba;
  final VoidCallback onTap;
  final VoidCallback? onFavoriteToggle;
  static String heroTag(String dhabaId) => 'store-image-$dhabaId';
  @override
  Widget build(BuildContext context) {
    final k = context.k;
    return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Material(
            color: k.surface,
            shape: RoundedRectangleBorder(
                borderRadius: KRadius.card, side: BorderSide(color: k.line)),
            child: InkWell(
                borderRadius: KRadius.card,
                onTap: onTap,
                child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          ClipRRect(
                              borderRadius: BorderRadius.circular(12),
                              child: SizedBox(
                                  width: 64,
                                  height: 72,
                                  child: KImage(dhaba.bannerUrl,
                                      fallbackIcon:
                                          Icons.storefront_outlined))),
                          const SizedBox(width: 12),
                          Expanded(
                              child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                Text(dhaba.name,
                                    style: KraveoType.titleMd
                                        .copyWith(color: k.ink)),
                                if (dhaba.cuisineLabel.isNotEmpty)
                                  Text(dhaba.cuisineLabel,
                                      style: KraveoType.caption
                                          .copyWith(color: k.inkMuted)),
                                const SizedBox(height: 4),
                                Text(
                                    dhaba.isAcceptingOrders
                                        ? 'Open · Delivery ${rupee(dhaba.deliveryFee)}'
                                        : 'Closed for orders',
                                    style: KraveoType.bodySm.copyWith(
                                        color: dhaba.isAcceptingOrders
                                            ? k.brand
                                            : k.inkMuted)),
                                if (dhaba.distanceKm != null)
                                  Text(
                                      '~${dhaba.distanceKm!.toStringAsFixed(1)} km away',
                                      style: KraveoType.caption
                                          .copyWith(color: k.inkMuted)),
                                if (dhaba.rating > 0)
                                  Text('★ ${dhaba.rating.toStringAsFixed(1)}',
                                      style: KraveoType.caption),
                              ])),
                          if (onFavoriteToggle != null)
                            IconButton(
                                tooltip: dhaba.isFavorite
                                    ? 'Remove ${dhaba.name} from favourites'
                                    : 'Save ${dhaba.name} to favourites',
                                onPressed: onFavoriteToggle,
                                icon: Icon(
                                    dhaba.isFavorite
                                        ? Icons.favorite
                                        : Icons.favorite_border,
                                    color: dhaba.isFavorite
                                        ? k.error
                                        : k.inkMuted)),
                        ])))));
  }
}
