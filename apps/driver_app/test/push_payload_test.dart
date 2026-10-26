import 'package:driver_app/services/push/push_payload.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('PushPayload.tryParse', () {
    test(
        'short-lived delivery offer metadata is parsed without making a tap an acceptance',
        () {
      final expiry = DateTime.utc(2026, 10, 26, 12, 0, 45);
      final payload = PushPayload.tryParse({
        'event': 'NEW_DELIVERY',
        'orderId': 'ord_1',
        'v': '1',
        'offerId': 'offer_1',
        'offerExpiresAt': expiry.toIso8601String()
      })!;
      expect(payload.offerId, 'offer_1');
      expect(
          payload.offerExpiredAt(expiry.subtract(const Duration(seconds: 1))),
          isFalse);
      expect(payload.offerExpiredAt(expiry), isTrue);
      expect(
          const PushPayload(event: PushEvent.newDelivery, orderId: 'old')
              .offerExpiredAt(expiry),
          isTrue);
      expect(
          PushPayload.tryParse({
            'event': 'NEW_DELIVERY',
            'orderId': 'a',
            'offerExpiresAt': 'yesterday'
          }),
          isNull);
    });
    test('the three rider events parse', () {
      for (final e in PushEvent.values) {
        final p = PushPayload.tryParse(
            {'event': e.key, 'orderId': 'ord_123', 'v': '1'});
        expect(p, PushPayload(event: e, orderId: 'ord_123'));
      }
    });

    test('a missing version is read as 1', () {
      expect(PushPayload.tryParse({'event': 'NEW_DELIVERY', 'orderId': 'a1'}),
          isNotNull);
    });

    test('malformed or foreign payloads are ignored without throwing', () {
      final bad = <Object?>[
        null,
        'NEW_DELIVERY',
        42,
        <String, dynamic>{},
        {'event': 'NEW_ORDER', 'orderId': 'a1', 'v': '1'}, // a vendor event
        {
          'event': 'ORDER_DELIVERED',
          'orderId': 'a1',
          'v': '1'
        }, // a customer event
        {'event': 'new_delivery', 'orderId': 'a1'}, // wrong case
        {'event': 7, 'orderId': 'a1'},
        {'event': null, 'orderId': 'a1'},
        {'event': 'NEW_DELIVERY'},
        {'event': 'NEW_DELIVERY', 'orderId': ''},
        {'event': 'NEW_DELIVERY', 'orderId': 12},
        {'event': 'NEW_DELIVERY', 'orderId': 'has space'},
        {'event': 'NEW_DELIVERY', 'orderId': 'x' * 200},
        {'event': 'NEW_DELIVERY', 'orderId': '<script>'},
        {'event': 'NEW_DELIVERY', 'orderId': 'a1', 'v': '2'},
        {
          'event': 'NEW_DELIVERY',
          'orderId': 'a1',
          'v': const <int>[1]
        },
      ];
      for (final data in bad) {
        expect(() => PushPayload.tryParse(data), returnsNormally,
            reason: '$data');
        expect(PushPayload.tryParse(data), isNull, reason: '$data');
      }
    });
  });
}
