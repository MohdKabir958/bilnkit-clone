import 'food_category.dart';

class Dhaba {
  final String? publicPhone;
  final String? description;
  final Object? operatingHours;
  final String? primaryCategoryId;
  final String id;
  final String name;
  final String category;
  final double rating;
  final String eta;
  final double? distanceKm;
  final String bannerUrl;
  final bool isAcceptingOrders;
  final String address;
  final double deliveryFee;
  final double minOrder;
  final bool isFavorite;
  final List<String> tags;

  /// The restaurant's managed categories in the admin's order (empty on old servers or self sign-up kitchens).
  final List<Cuisine> cuisines;

  Dhaba({
    this.publicPhone,
    this.description,
    this.operatingHours,
    this.primaryCategoryId,
    required this.id,
    required this.name,
    required this.category,
    required this.rating,
    required this.eta,
    this.distanceKm,
    required this.bannerUrl,
    required this.isAcceptingOrders,
    required this.address,
    this.deliveryFee = 25.0,
    this.minOrder = 99.0,
    this.isFavorite = false,
    this.tags = const [],
    this.cuisines = const [],
  });

  /// What cards, the menu header and search show: the cuisines joined with " • ", else the legacy `category` text.
  String get cuisineLabel =>
      cuisines.isEmpty ? category : cuisines.map((c) => c.name).join(' • ');

  String get hoursLabel {
    if (operatingHours is! List) return 'Opening hours: managed by the store';
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    String time(int m) =>
        '${(m ~/ 60).toString().padLeft(2, '0')}:${(m % 60).toString().padLeft(2, '0')}';
    final lines = <String>[];
    for (final raw in operatingHours as List) {
      if (raw is! Map ||
          raw['day'] is! int ||
          raw['opens'] is! int ||
          raw['closes'] is! int) {
        continue;
      }
      final day = raw['day'] as int;
      if (day < 0 || day > 6) continue;
      lines.add(
          '${days[day]} ${time(raw['opens'] as int)}–${time(raw['closes'] as int)}');
    }
    return 'Opening hours (IST): ${lines.join(' · ')}';
  }

  Dhaba copyWith({
    String? id,
    String? name,
    String? category,
    double? rating,
    String? eta,
    double? distanceKm,
    String? bannerUrl,
    bool? isAcceptingOrders,
    String? address,
    double? deliveryFee,
    double? minOrder,
    bool? isFavorite,
    List<String>? tags,
    List<Cuisine>? cuisines,
  }) {
    return Dhaba(
      publicPhone: publicPhone,
      description: description,
      operatingHours: operatingHours,
      primaryCategoryId: primaryCategoryId,
      id: id ?? this.id,
      name: name ?? this.name,
      category: category ?? this.category,
      rating: rating ?? this.rating,
      eta: eta ?? this.eta,
      distanceKm: distanceKm ?? this.distanceKm,
      bannerUrl: bannerUrl ?? this.bannerUrl,
      isAcceptingOrders: isAcceptingOrders ?? this.isAcceptingOrders,
      address: address ?? this.address,
      deliveryFee: deliveryFee ?? this.deliveryFee,
      minOrder: minOrder ?? this.minOrder,
      isFavorite: isFavorite ?? this.isFavorite,
      tags: tags ?? this.tags,
      cuisines: cuisines ?? this.cuisines,
    );
  }

  factory Dhaba.fromJson(Map<String, dynamic> json) {
    return Dhaba(
      publicPhone: json['publicPhone'] as String?,
      description: json['description'] as String?,
      operatingHours: json['operatingHours'],
      primaryCategoryId: json['primaryCategoryId'] as String?,
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      category: json['category'] ?? '',
      rating: (json['rating'] ?? 0).toDouble(),
      eta: json['eta'] ?? '',
      distanceKm: (json['distanceKm'] as num?)?.toDouble(),
      bannerUrl: json['bannerImage'] ?? json['bannerUrl'] ?? '',
      isAcceptingOrders: json['isAcceptingOrders'] ?? true,
      address: json['address'] ?? '',
      deliveryFee: json['feePaise'] is num
          ? (json['feePaise'] as num).toDouble() / 100
          : (json['deliveryFee'] ?? 25.0).toDouble(),
      minOrder: (json['minOrder'] ?? 99.0).toDouble(),
      isFavorite: json['isFavorite'] ?? false,
      tags: json['tags'] is List
          ? [
              for (final t in json['tags'] as List)
                if (t != null) t.toString()
            ]
          : [],
      cuisines: Cuisine.parseList(json['cuisines']),
    );
  }
}
