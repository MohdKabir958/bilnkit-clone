import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';
import 'driver_api_service.dart';

class SupportApi {
  static Future<Map<String, dynamic>> call(String method, String path,
      [Map<String, dynamic>? data]) async {
    final client = http.Client();
    try {
      final request =
          http.Request(method, Uri.parse('${ApiConfig.baseUrl}$path'))
            ..headers.addAll(await DriverApiService.getAuthHeaders());
      if (data != null) request.body = jsonEncode(data);
      final response = await http.Response.fromStream(
              await client.send(request).timeout(const Duration(seconds: 15)))
          .timeout(const Duration(seconds: 15));
      DriverApiService.checkAuthResponse(response);
      final body = jsonDecode(response.body);
      if (response.statusCode >= 400 ||
          body is! Map ||
          body['success'] != true) {
        throw Exception(body is Map
            ? body['message'] ?? 'Unable to reach support.'
            : 'Unable to reach support.');
      }
      return Map<String, dynamic>.from(body);
    } finally {
      client.close();
    }
  }
}
