import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:driver_app/models/geo.dart';
import 'package:driver_app/services/navigation.dart';

void main() {
  final scenario =
      jsonDecode(File('../../demo/scenario.json').readAsStringSync())
          as Map<String, dynamic>;
  test(
      'each simulated store navigation destination preserves the sourced coordinate',
      () {
    for (final store in scenario['stores']) {
      final point = scenario['points'][store['point']];
      final p = GeoPoint(
          (point['lat'] as num).toDouble(), (point['lng'] as num).toDouble());
      final links = navigationUris(p, label: store['name']);
      expect(links.length, 3);
      expect(links.last.queryParameters['destination'],
          '${p.lat.toStringAsFixed(6)},${p.lng.toStringAsFixed(6)}');
      expect(links.first.scheme, 'google.navigation');
      expect(point['source'], startsWith('https://github.com/'));
    }
  });
  test(
      'demo customer pins stay within the configured service circle without legacy lookup',
      () {
    final zone = scenario['zone'];
    final center = GeoPoint((zone['centerLat'] as num).toDouble(),
        (zone['centerLng'] as num).toDouble());
    for (final address in scenario['addresses']) {
      final point = scenario['points'][address['point']];
      final p = GeoPoint(
          (point['lat'] as num).toDouble(), (point['lng'] as num).toDouble());
      expect(p.isValid, isTrue);
      expect(distanceMeters(center, p),
          lessThanOrEqualTo((zone['radiusKm'] as num) * 1000));
      expect(navigationUris(p).last.queryParameters['destination'],
          '${p.lat.toStringAsFixed(6)},${p.lng.toStringAsFixed(6)}');
    }
  });
}
