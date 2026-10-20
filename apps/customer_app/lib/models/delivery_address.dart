class DeliveryAddress {
  DeliveryAddress(this.data);
  final Map<String, dynamic> data;
  String get id => data['id'] as String;
  String get customerId => data['customerId'] as String;
  bool get isDefault => data['isDefault'] == true;
  String get label => data['label'] as String? ?? 'Address';
  String get formatted =>
      '${data['houseNumber']}, ${data['street']}, ${data['locality']}, ${(data['city'] as Map?)?['name'] ?? ''} ${data['pinCode']}';
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
