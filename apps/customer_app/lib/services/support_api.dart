import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import '../config/api_config.dart';
import 'customer_api_service.dart';

class SupportApi {
  static Future<void> attachPhoto(String caseId) async {
    final file = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 2400,
        maxHeight: 2400,
        imageQuality: 85,
        requestFullMetadata: false);
    if (file == null) return;
    final bytes = await file.readAsBytes();
    if (bytes.length > 2 * 1024 * 1024) {
      throw Exception('Choose a photo smaller than 2 MB.');
    }
    final lower = file.name.toLowerCase();
    final mime = lower.endsWith('.png')
        ? 'image/png'
        : lower.endsWith('.webp')
            ? 'image/webp'
            : 'image/jpeg';
    final headers = await CustomerApiService.getAuthHeaders();
    headers['Content-Type'] = mime;
    final response = await http
        .post(
            Uri.parse(
                '${ApiConfig.baseUrl}/v1/support-cases/${Uri.encodeComponent(caseId)}/evidence'),
            headers: headers,
            body: bytes)
        .timeout(const Duration(seconds: 20));
    if (response.statusCode >= 400) {
      final body = jsonDecode(response.body);
      throw Exception(body is Map
          ? body['message'] ?? 'Photo upload failed.'
          : 'Photo upload failed.');
    }
  }

  static Future<Uint8List> readPhoto(String caseId, String id) async {
    final response = await CustomerApiService.authorizedRequest('GET',
        '/v1/support-cases/${Uri.encodeComponent(caseId)}/evidence/${Uri.encodeComponent(id)}');
    if (response.statusCode >= 400) {
      final body = jsonDecode(response.body);
      throw Exception(body is Map
          ? body['message'] ?? 'Photo unavailable.'
          : 'Photo unavailable.');
    }
    return response.bodyBytes;
  }

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
