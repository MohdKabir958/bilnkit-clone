import 'package:kraveo_ui/kraveo_ui.dart' show BrandConfig;
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:kraveo_ui/kraveo_ui.dart' show SecureSessionTokens;
import '../config/api_config.dart';

class DriverApiService {
  static const String _tokenPrefKey = 'kraveo_driver_jwt_token';
  static String? _cachedToken;
  static int _tokenEpoch = 0;

  /// Shown when the server rejects the saved token (HTTP 401) on an authenticated call.
  static const String sessionExpiredMessage =
      'Session expired. Please log in again.';

  /// Shown when the 401 says an admin paused the account (`reason: ACCOUNT_SUSPENDED`).
  static const String accountPausedMessage =
      'Your ${BrandConfig.name} account is paused. Please contact ${BrandConfig.name} support.';

  /// True when a 401 body says the token ended because the account was suspended.
  static bool isSuspendedBody(String body) {
    if (!body.contains('ACCOUNT_SUSPENDED')) return false;
    try {
      final json = jsonDecode(body);
      return json is Map && json['reason'] == 'ACCOUNT_SUSPENDED';
    } catch (_) {
      return false;
    }
  }

  /// Set by the session gate. Called when any authenticated request comes back 401, so the
  /// app can drop the dead token and return to the login screen.
  static void Function()? onUnauthorized;

  /// Like [onUnauthorized], for a 401 that says the account was suspended. When nothing is registered here,
  /// [onUnauthorized] gets the call as before.
  static void Function()? onSuspended;

  /// Set by the session gate. Called when Grozo answers 403 PARTNER_NOT_APPROVED, i.e. an admin suspended
  /// this account while the app was open, so the app can re-check its status and move to the status screen.
  static void Function()? onNotApproved;

  /// A 401 on an authenticated call means the JWT is expired or revoked; a 403 with the
  /// PARTNER_NOT_APPROVED code means the account was suspended (or never approved).
  /// Every authenticated call in the app (including the order API) runs its response through this.
  static void checkAuthResponse(http.Response response) {
    if (response.statusCode == 401) {
      final suspended = onSuspended;
      if (suspended != null && isSuspendedBody(response.body)) {
        suspended();
      } else {
        onUnauthorized?.call();
      }
    } else if (response.statusCode == 403 &&
        response.body.contains('PARTNER_NOT_APPROVED')) {
      onNotApproved?.call();
    }
  }

  /// Retrieves the JWT from protected storage or the in-memory session cache
  static Future<String?> getSavedToken() async {
    if (_cachedToken != null && _cachedToken!.isNotEmpty) {
      return _cachedToken;
    }
    final epoch = _tokenEpoch;
    try {
      final stored = await SecureSessionTokens.read(_tokenPrefKey);
      if (epoch != _tokenEpoch) return _cachedToken;
      _cachedToken = stored;
      return _cachedToken;
    } catch (_) {
      return _cachedToken;
    }
  }

  /// Saves JWT token to local persistence
  static Future<void> saveToken(String token) async {
    _tokenEpoch++;
    _cachedToken = token;
    try {
      await SecureSessionTokens.write(_tokenPrefKey, token);
    } catch (_) {}
  }

  /// Forgets the JWT (memory and disk). Called on logout and on session expiry.
  static Future<void> clearToken() async {
    _tokenEpoch++;
    _cachedToken = null;
    try {
      await SecureSessionTokens.delete(_tokenPrefKey);
    } catch (_) {}
  }

  /// Builds authenticated request headers dynamically
  static Future<Map<String, String>> getAuthHeaders() async {
    final token = await getSavedToken();
    final headers = <String, String>{
      'Content-Type': 'application/json',
    };
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] =
          token.startsWith('Bearer ') ? token : 'Bearer $token';
    }
    return headers;
  }

  /// Driver updates duty status (ONLINE / OFFLINE) on backend. Used by logout (best effort); the
  /// duty switch itself goes through [RiderOrdersApi.setDuty] so it can tell the rider what failed.
  /// Order actions (claim, status, delivery verification code, release) and GPS live in `rider_orders_api.dart`.
  static Future<bool> toggleDutyStatus(bool isOnline) async {
    try {
      final url = Uri.parse('${ApiConfig.baseUrl}/drivers/duty-status');
      final headers = await getAuthHeaders();

      final response = await http
          .post(
            url,
            headers: headers,
            body: jsonEncode({'isOnline': isOnline}),
          )
          .timeout(const Duration(seconds: 4));

      checkAuthResponse(response);
      if (response.statusCode == 200) {
        debugPrint(
            '🟢 [Driver API] Duty status synced: ${isOnline ? "ONLINE" : "OFFLINE"}');
        return true;
      }
    } catch (e) {
      debugPrint('⚠️ [Driver API Notice] Duty status sync delayed ($e).');
    }
    return false;
  }
}
