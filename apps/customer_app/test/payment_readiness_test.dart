import 'dart:convert';
import 'package:customer_app/models/order_group.dart';
import 'package:customer_app/screens/order_changes_screen.dart';
import 'package:customer_app/services/customer_api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test(
      'authoritative empty payment list stays empty and does not invent online payment',
      () {
    final q = OrderQuote.tryParse({
      'total': 105,
      'subtotal': 80,
      'paymentMethods': [],
      'paymentCapabilities': {'message': 'Payments unavailable'}
    })!;
    expect(q.paymentMethods, isEmpty);
    expect(q.paymentMessage, 'Payments unavailable');
    expect(OrderQuote.tryParse({'total': 105, 'subtotal': 80})!.paymentMethods,
        isEmpty);
  });
  testWidgets(
      'customer reviews full alternative basket and lost decision answer retries the same key',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    await CustomerApiService.saveToken('local-widget-fixture');
    final posts = <Map<String, dynamic>>[];
    var applied = false;
    CustomerApiService.httpClientOverride = MockClient((r) async {
      expect(r.headers['authorization'], 'Bearer local-widget-fixture');
      if (r.method == 'POST') {
        posts.add(Map<String, dynamic>.from(jsonDecode(r.body)));
        if (posts.length == 1) throw Exception('Lost response');
        applied = true;
        return http.Response('{"success":true}', 200);
      }
      return http.Response(
          jsonEncode({
            'success': true,
            'data': [
              {
                'id': 'change-a',
                'version': 1,
                'state': applied ? 'APPLIED' : 'PROPOSED',
                'reason': 'One pack unavailable',
                'expiresAt': '2099-01-01T00:00:00Z',
                'originalTotalPaise': 20500,
                'proposedTotalPaise': 11500,
                'refundDuePaise': 9000,
                'amounts': {
                  'subtotal': 90,
                  'deliveryFee': 25,
                  'taxAndPackaging': 0,
                  'discount': 0,
                  'couponMessage': 'The old coupon no longer meets its minimum.'
                },
                'items': [
                  {'name': 'Replacement rice', 'quantity': 1, 'price': 90}
                ]
              }
            ]
          }),
          200);
    });
    addTearDown(() async {
      CustomerApiService.httpClientOverride = null;
      await CustomerApiService.clearToken();
    });
    tester.view.physicalSize = const Size(900, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
        const MaterialApp(home: OrderChangesScreen(orderId: 'order-a')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Replacement rice'), findsOneWidget);
    expect(find.text('Products ₹90.00'), findsOneWidget);
    expect(find.textContaining('old coupon no longer'), findsOneWidget);
    await tester.tap(find.text('Accept updated basket'));
    await tester.pumpAndSettle();
    expect(find.text('Recheck the same decision'), findsOneWidget);
    await tester.tap(find.text('Recheck the same decision'));
    await tester.pumpAndSettle();
    expect(posts.length, 2);
    expect(posts[0], posts[1]);
    expect(posts[1]['decision'], 'ACCEPT');
    expect(find.text('APPLIED'), findsOneWidget);
  });
}
