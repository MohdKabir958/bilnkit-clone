import 'customization.dart';

class MenuItemModel {
  final String id;
  final String vendorId;
  final String name;
  final double price;
  final String category;
  final String description;
  final String imageUrl;
  final bool isAvailable;
  final bool isVeg;
  final String? sku, productKey;
  final String unit, packSize;
  final int? stockQty, mrpPaise;
  final List<String> imageUrls;
  final List<CustomizationGroup> customizationGroups;

  const MenuItemModel({
    required this.id,
    required this.vendorId,
    required this.name,
    required this.price,
    required this.category,
    required this.description,
    required this.imageUrl,
    required this.isAvailable,
    this.sku,
    this.productKey,
    this.unit = 'pcs',
    this.packSize = '1',
    this.stockQty,
    this.mrpPaise,
    this.imageUrls = const [],
    this.isVeg = true,
    this.customizationGroups = const [],
  });

  String get displayName => sku == null ? name : '$name · $packSize $unit';
  String get primaryImage => imageUrls.isNotEmpty ? imageUrls.first : imageUrl;
  double get savings => mrpPaise != null && mrpPaise! > (price * 100).round()
      ? mrpPaise! / 100 - price
      : 0;
  bool get hasCustomizations => customizationGroups.isNotEmpty;

  factory MenuItemModel.fromJson(Map<String, dynamic> json) {
    return MenuItemModel(
      sku: json['sku'],
      productKey: json['productKey'],
      unit: json['unit'] ?? 'pcs',
      packSize: json['packSize'] ?? '1',
      stockQty: json['stockQty'],
      mrpPaise: json['mrpPaise'],
      imageUrls:
          (json['imageUrls'] as List?)?.whereType<String>().toList() ?? [],
      id: json['id'] ?? '',
      vendorId: json['vendorId'] ?? '',
      name: json['name'] ?? '',
      price: (json['price'] ?? 0).toDouble(),
      category: json['category'] ?? '',
      description: json['description'] ?? '',
      imageUrl: json['imageUrl'] ?? '',
      isAvailable: json['isAvailable'] ?? true,
      isVeg: json['isVeg'] ?? true,
      customizationGroups: (json['customizationGroups'] as List<dynamic>?)
              ?.map((cg) =>
                  CustomizationGroup.fromJson(cg as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }
}
