import 'package:flutter_test/flutter_test.dart';
import 'package:kraveo_ui/kraveo_ui.dart' show GrozoAuthConfig;
import 'package:customer_app/config/api_config.dart';

void main() {
  test(
      'deployment headers describe the configured auth mode without credentials',
      () {
    final headers = ApiConfig.clientHeaders;
    expect(headers['X-Grozo-Auth-Mode'], GrozoAuthConfig.mode);
    expect(headers['X-Grozo-Client-Protocol'], '1');
    expect(headers['X-Grozo-Client'], 'customer/mobile');
    expect(headers.keys, isNot(contains('Authorization')));
    expect(headers.keys.any((key) => key.toLowerCase().contains('secret')),
        isFalse);
    if (GrozoAuthConfig.usesClerk && ApiConfig.clerkFrontendOrigin.isNotEmpty) {
      expect(headers['X-Grozo-Clerk-Frontend'], ApiConfig.clerkFrontendOrigin);
    } else {
      expect(headers.containsKey('X-Grozo-Clerk-Frontend'), isFalse);
    }
  });
  test(
      'API and Socket endpoints never contain credentials, queries, or fragments',
      () {
    for (final value in [ApiConfig.baseUrl, ApiConfig.socketUrl]) {
      final uri = Uri.parse(value);
      expect(uri.hasAuthority, isTrue);
      expect(uri.userInfo, isEmpty);
      expect(uri.hasQuery, isFalse);
      expect(uri.hasFragment, isFalse);
    }
  });
}
