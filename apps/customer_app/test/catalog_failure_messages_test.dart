import 'dart:convert';

import 'package:customer_app/providers/dhaba_provider.dart';
import 'package:customer_app/services/customer_api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

void main() {
  test('address-required response points to delivery address, not Wi-Fi', () {
    final failure = CatalogLoadFailure.fromResponse(http.Response(
      jsonEncode({
        'success': false,
        'code': 'ADDRESS_REQUIRED',
        'message': 'Select one of your saved delivery addresses.',
      }),
      400,
    ));
    expect(failure.needsAddress, isTrue);
    expect(failure.message, contains('delivery address'));
    expect(failure.message.toLowerCase(), isNot(contains('connection')));
  });

  test('unsupported delivery area offers another address', () {
    final failure = CatalogLoadFailure.fromResponse(http.Response(
      '{"code":"AREA_UNSUPPORTED"}',
      409,
    ));
    expect(failure.needsAddress, isTrue);
    expect(failure.message, contains('another delivery address'));
  });

  test('server failures do not accuse the phone network', () {
    final failure = CatalogLoadFailure.fromResponse(http.Response('<html>down</html>', 503));
    expect(failure.needsAddress, isFalse);
    expect(failure.code, 'STORE_SERVICE_UNAVAILABLE');
    expect(failure.message, contains('store service'));
    expect(failure.message, contains('internet connection may be fine'));
  });

  test('role rejection and outdated backend have different messages', () {
    final forbidden = CatalogLoadFailure.fromResponse(http.Response('{"code":"FORBIDDEN"}', 403));
    final oldServer = CatalogLoadFailure.fromResponse(http.Response('Not Found', 404));
    expect(forbidden.code, 'CUSTOMER_ACCESS_REQUIRED');
    expect(forbidden.message, contains('customer account'));
    expect(oldServer.code, 'SERVICE_VERSION_MISMATCH');
    expect(oldServer.message, contains('backend'));
  });

  test('Home can request address selection without loading remote catalog', () {
    CustomerApiService.selectedAddressId = null;
    final provider = DhabaProvider();
    try {
      provider.requireDeliveryAddress();
      expect(provider.hasCatalogFailed, isTrue);
      expect(provider.catalogNeedsAddress, isTrue);
      expect(provider.catalogErrorMessage, contains('delivery address'));
    } finally {
      provider.dispose();
    }
  });
}
