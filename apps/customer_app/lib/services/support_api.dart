import 'dart:convert';
import 'customer_api_service.dart';

class SupportApi {
  static Future<Map<String, dynamic>> call(String method, String path,
      [Map<String, dynamic>? data]) async {
    final response =
        await CustomerApiService.authorizedRequest(method, path, body: data);
    final body = jsonDecode(response.body);
    if (response.statusCode >= 400 || body is! Map || body['success'] != true) {
      throw Exception(body is Map
          ? body['message'] ?? 'Unable to reach support.'
          : 'Unable to reach support.');
    }
    return Map<String, dynamic>.from(body);
  }
}
