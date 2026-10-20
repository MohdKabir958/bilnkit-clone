import 'package:flutter/foundation.dart';

class ApiConfig {
  static const bool isProduction = kReleaseMode;
  static const String _configuredApi = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:5000/api');
  static const String _configuredSocket = String.fromEnvironment('SOCKET_URL');
  static String get baseUrl {
    final uri = Uri.parse(_configuredApi);
    if (!uri.hasAuthority || uri.userInfo.isNotEmpty || (kReleaseMode && uri.scheme != 'https')) throw StateError('Configure an owned HTTPS API_BASE_URL for release.');
    return _configuredApi.replaceFirst(RegExp(r'/+$'), '');
  }
  static String get socketUrl {
    final url = _configuredSocket.isEmpty ? baseUrl.replaceFirst(RegExp(r'/api$'), '') : _configuredSocket;
    final uri = Uri.parse(url);
    if (!uri.hasAuthority || uri.userInfo.isNotEmpty || (kReleaseMode && uri.scheme != 'https')) throw StateError('Configure an owned HTTPS SOCKET_URL for release.');
    return url;
  }

  /// Optional Web OAuth client id for Google Sign-In, passed as `serverClientId`.
  /// On Android the plugin reads it from google-services.json (`default_web_client_id`), so this
  /// only needs to be set when that file has no web client:
  /// `--dart-define=GOOGLE_SERVER_CLIENT_ID=xxxx.apps.googleusercontent.com`.
  static const String googleServerClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');
}
