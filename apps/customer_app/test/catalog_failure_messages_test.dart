import 'dart:convert';
import 'package:customer_app/providers/dhaba_provider.dart';
import 'package:customer_app/services/customer_api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

void main() {
  test('address-required response points to delivery address, not Wi-Fi', () {
    final failure = CatalogApiFailure.fromResponse(http.Response(
        jsonEncode({'code': 'ADDRESS_REQUIRED', 'field': 'addressId'}), 400));
    final message = describeCatalogFailure(failure);
    expect(failure.needsAddress, isTrue);
    expect(message, contains('delivery address'));
    expect(message.toLowerCase(), isNot(contains('connection')));
  });
  test('unsupported delivery area offers another address', () {
    final failure = CatalogApiFailure.fromResponse(
        http.Response('{"code":"AREA_UNSUPPORTED"}', 409));
    expect(failure.needsAddress, isTrue);
    expect(describeCatalogFailure(failure), contains('another delivery address'));
  });
  test('server failures do not accuse the phone network', () {
    final failure = CatalogApiFailure.fromResponse(
        http.Response('<html>down</html>', 503));
    expect(failure.needsAddress, isFalse);
    expect(describeCatalogFailure(failure), contains('Grozo servers'));
    expect(describeCatalogFailure(failure), isNot(contains('Check your connection')));
  });
  test('role rejection and outdated backend have different messages', () {
    final forbidden = CatalogApiFailure.fromResponse(
        http.Response('{"code":"FORBIDDEN"}', 403));
    final oldServer = CatalogApiFailure.fromResponse(
        http.Response('{"code":"NOT_FOUND"}', 404));
    expect(describeCatalogFailure(forbidden), contains('account'));
    expect(describeCatalogFailure(oldServer), contains('backend version'));
    expect(oldServer.needsAddress, isFalse);
  });
  test('malformed response is not displayed as raw HTML', () {
    final failure = CatalogApiFailure.fromResponse(
        http.Response('<html>proxy unavailable</html>', 200));
    expect(describeCatalogFailure(failure), contains('unexpected store list'));
    expect(describeCatalogFailure(failure), isNot(contains('<html>')));
  });
}
