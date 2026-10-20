import 'dart:convert';
import '../models/delivery_address.dart';
import 'customer_api_service.dart';

class AddressApi {
  static Future<Map<String, dynamic>> call(String method, String path,
      [Map<String, dynamic>? data]) async {
    final response = await CustomerApiService.authorizedRequest(
        method, '/v1/$path',
        body: data);
    dynamic raw;
    try {
      raw = jsonDecode(response.body);
    } catch (_) {
      throw Exception(
          'The address service could not be reached. Please try again.');
    }
    if (raw is! Map ||
        response.statusCode < 200 ||
        response.statusCode >= 300 ||
        raw['success'] != true) {
      throw Exception(raw is Map
          ? raw['message'] ?? 'The address could not be loaded.'
          : 'The server response could not be read.');
    }
    return Map<String, dynamic>.from(raw);
  }

  static Future<List<DeliveryAddress>> list() async {
    final all = <DeliveryAddress>[];
    String? after;
    do {
      final raw = await call('GET',
          'addresses?limit=100${after == null ? '' : '&after=${Uri.encodeQueryComponent(after)}'}');
      all.addAll((raw['data'] as List)
          .map((a) => DeliveryAddress(Map<String, dynamic>.from(a))));
      after = raw['nextCursor'] as String?;
    } while (after != null);
    return all;
  }

  static Future<List<Map<String, dynamic>>> cities() async {
    final all = <Map<String, dynamic>>[];
    String? after;
    do {
      final raw = await call('GET',
          'cities?limit=100${after == null ? '' : '&after=${Uri.encodeQueryComponent(after)}'}');
      all.addAll(
          (raw['data'] as List).map((a) => Map<String, dynamic>.from(a)));
      after = raw['nextCursor'] as String?;
    } while (after != null);
    return all;
  }

  static Future<DeliveryAddress> save(Map<String, dynamic> data,
      {String? id}) async {
    final raw = await call(id == null ? 'POST' : 'PUT',
        id == null ? 'addresses' : 'addresses/$id', data);
    return DeliveryAddress(Map<String, dynamic>.from(raw['data']));
  }

  static Future<void> delete(String id) async {
    await call('DELETE', 'addresses/$id');
  }
}
