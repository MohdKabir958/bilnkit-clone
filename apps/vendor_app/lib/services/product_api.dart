import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';
import 'vendor_api_service.dart';

class ProductApi {
  ProductApi({http.Client? client}) : _client = client;
  final http.Client? _client;
  Future<String> uploadImage(Uint8List bytes, String mime) async {
    final headers = await VendorApiService.getAuthHeaders();
    headers['Content-Type'] = mime;
    final response = await (_client?.post(
                Uri.parse(
                    '${ApiConfig.baseUrl}/v1/partner/uploads/image?purpose=dish'),
                headers: headers,
                body: bytes) ??
            http.post(
                Uri.parse(
                    '${ApiConfig.baseUrl}/v1/partner/uploads/image?purpose=dish'),
                headers: headers,
                body: bytes))
        .timeout(const Duration(seconds: 30));
    VendorApiService.checkResponse(response);
    final result = jsonDecode(response.body);
    if (response.statusCode != 201) {
      throw Exception(result['message'] ?? 'Image upload failed.');
    }
    return result['data']['url'] as String;
  }

  Future<Map<String, dynamic>> call(String method, String path,
      [Map<String, dynamic>? body]) async {
    final client = _client ?? http.Client();
    try {
      final request =
          http.Request(method, Uri.parse('${ApiConfig.baseUrl}$path'))
            ..headers.addAll(await VendorApiService.getAuthHeaders());
      if (body != null) request.body = jsonEncode(body);
      final response = await http.Response.fromStream(
              await client.send(request).timeout(const Duration(seconds: 15)))
          .timeout(const Duration(seconds: 15));
      VendorApiService.checkResponse(response);
      final result = jsonDecode(response.body);
      if (response.statusCode >= 400 ||
          result is! Map ||
          result['success'] != true) {
        throw Exception(result is Map
            ? result['message'] ?? 'Unable to save this change.'
            : 'Unable to reach the store API.');
      }
      return Map<String, dynamic>.from(result);
    } finally {
      if (_client == null) client.close();
    }
  }
}
