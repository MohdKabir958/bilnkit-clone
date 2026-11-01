class DeliveryAddress {
  DeliveryAddress(this.data);
  final Map<String, dynamic> data;
  String get id => data['id'] as String;
  String get customerId => data['customerId'] as String;
  bool get isDefault => data['isDefault'] == true;
  String get label => data['label'] as String? ?? 'Address';
  String get formatted {
    String text(Object? value) => value is String ? value.trim() : '';
    final street = text(data['street']);
    final locality = text(data['locality']);
    final city = data['city'];
    final cityAndPin = [
      text(city is Map ? city['name'] : null),
      text(data['pinCode']),
    ].where((part) => part.isNotEmpty).join(' ');
    return [
      text(data['houseNumber']),
      street,
      if (locality.toLowerCase() != street.toLowerCase()) locality,
      cityAndPin,
    ].where((part) => part.isNotEmpty).join(', ');
  }
  Map<String, dynamic> toWrite({bool? isDefault}) => {
        for (final key in [
          'cityId',
          'country',
          'label',
          'pinCode',
          'locality',
          'houseNumber',
          'street',
          'landmark',
          'instructions',
          'lat',
          'lng'
        ])
          key: data[key],
        'isDefault': isDefault ?? this.isDefault,
      };
}
