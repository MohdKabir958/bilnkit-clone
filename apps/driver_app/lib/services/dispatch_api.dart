import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';
import 'driver_api_service.dart';

abstract class RiderDispatchApi {
  Future<String?> decline(String offerId);
}

class HttpRiderDispatchApi implements RiderDispatchApi {
  const HttpRiderDispatchApi({this.client});
  final http.Client? client;
  @override
  Future<String?> decline(String offerId) async {
    try {
      final uri = Uri.parse(
          '${ApiConfig.baseUrl}/v1/dispatch-offers/${Uri.encodeComponent(offerId)}/decline');
      final headers = await DriverApiService.getAuthHeaders();
      final response = await (client?.post(uri,
                  headers: headers,
                  body: jsonEncode(
                      {'reason': 'Not available for this pickup'})) ??
              http.post(uri,
                  headers: headers,
                  body:
                      jsonEncode({'reason': 'Not available for this pickup'})))
          .timeout(const Duration(seconds: 15));
      DriverApiService.checkAuthResponse(response);
      final body = jsonDecode(response.body);
      if (response.statusCode == 200) return null;
      return body is Map
          ? body['message']?.toString() ?? 'This offer could not be declined.'
          : 'This offer could not be declined.';
    } catch (_) {
      return 'Unable to reach operations. Your decline was not confirmed. Try again.';
    }
  }
}
