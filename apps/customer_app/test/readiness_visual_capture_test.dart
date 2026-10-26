// Production widgets rendered with explicit synthetic service data, never a device/provider claim.
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import 'package:customer_app/screens/order_changes_screen.dart';
import 'package:customer_app/services/customer_api_service.dart';
import '../../../packages/kraveo_ui/test_support/visual_capture.dart';

void main() {
  setUpAll(loadVisualFonts);
  testWidgets(
      'capture implemented item-change approval using synthetic service fixtures',
      (tester) async {
    await prepareVisual(tester);
    SharedPreferences.setMockInitialValues({});
    await CustomerApiService.saveToken('synthetic-rendering-fixture');
    CustomerApiService.httpClientOverride =
        MockClient((_) async => http.Response(
            jsonEncode({
              'success': true,
              'data': [
                {
                  'id': 'synthetic-change',
                  'version': 1,
                  'state': 'PROPOSED',
                  'reason':
                      'One rice pack is unavailable. Please review the smaller replacement pack.',
                  'expiresAt': DateTime.now()
                      .add(const Duration(minutes: 10))
                      .toIso8601String(),
                  'originalTotalPaise': 20500,
                  'proposedTotalPaise': 11500,
                  'refundDuePaise': 9000,
                  'items': [
                    {
                      'name': 'Rice · replacement 1 kg pack',
                      'quantity': 1,
                      'price': 90
                    }
                  ],
                  'amounts': {
                    'subtotal': 90,
                    'deliveryFee': 25,
                    'taxAndPackaging': 0,
                    'discount': 0
                  },
                  'couponMessage': null
                }
              ]
            }),
            200));
    addTearDown(() async {
      CustomerApiService.httpClientOverride = null;
      await CustomerApiService.clearToken();
    });
    await tester.pumpWidget(captureRoot(MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: KraveoTheme.customer(),
        home: const OrderChangesScreen(orderId: 'synthetic-order'))));
    await captureVisual(tester, 'customer', 'item-change-approval');
    expect(tester.takeException(), isNull);
  }, skip: !captureEnabled);
}
