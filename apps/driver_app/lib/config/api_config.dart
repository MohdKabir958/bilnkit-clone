import 'package:flutter/foundation.dart';
import 'package:kraveo_ui/kraveo_ui.dart' show GrozoAuthConfig;

class ApiConfig {
  static const bool isProduction = kReleaseMode;
  static const int protocolVersion = 1;
  static const String clerkFrontendOrigin =
      String.fromEnvironment('CLERK_FRONTEND_ORIGIN');

  /// Public deployment metadata only. Identity and permissions still require verified bearer tokens.
  static Map<String, String> get clientHeaders => {
        'X-Grozo-Auth-Mode': GrozoAuthConfig.mode,
        'X-Grozo-Client-Protocol': '$protocolVersion',
        'X-Grozo-Client': 'driver/mobile',
        if (GrozoAuthConfig.usesClerk && clerkFrontendOrigin.isNotEmpty)
          'X-Grozo-Clerk-Frontend': clerkFrontendOrigin,
      };

  static const String _configuredApi = String.fromEnvironment('API_BASE_URL',
      defaultValue: 'http://10.0.2.2:5000/api');
  static const String _configuredSocket = String.fromEnvironment('SOCKET_URL');
  static String get baseUrl {
    final uri = Uri.parse(_configuredApi);
    if (!uri.hasAuthority ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment ||
        (kReleaseMode && uri.scheme != 'https')) {
      throw StateError('Configure an owned HTTPS API_BASE_URL for release.');
    }
    return _configuredApi.replaceFirst(RegExp(r'/+$'), '');
  }

  static String get socketUrl {
    final url = _configuredSocket.isEmpty
        ? baseUrl.replaceFirst(RegExp(r'/api$'), '')
        : _configuredSocket;
    final uri = Uri.parse(url);
    if (!uri.hasAuthority ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment ||
        (kReleaseMode && uri.scheme != 'https')) {
      throw StateError('Configure an owned HTTPS SOCKET_URL for release.');
    }
    return url;
  }
}
