import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vendor_app/screens/store_profile_screen.dart';
import 'package:vendor_app/services/product_api.dart';
import 'package:vendor_app/services/vendor_api_service.dart';

void main() {
  final profile = {
    'id': 'store-a',
    'name': 'Local Store',
    'address': 'Shop 2 Main Road',
    'bannerImage': '',
    'pinCode': '560001',
    'city': {'name': 'Bengaluru', 'state': 'Karnataka'}
  };
  http.Response reply(Map<String, dynamic> data, [int status = 200]) =>
      http.Response(jsonEncode(data), status,
          headers: {'content-type': 'application/json'});
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await VendorApiService.saveToken('profile-test-token');
  });
  tearDown(() async {
    await VendorApiService.clearToken();
  });
  testWidgets(
      'loads and saves the owned store profile without exposing admin fields',
      (tester) async {
    final writes = <Map<String, dynamic>>[];
    final api = ProductApi(client: MockClient((r) async {
      expect(r.url.path, endsWith('/v1/partner/store'));
      expect(r.headers['authorization'], 'Bearer profile-test-token');
      if (r.method == 'PUT') {
        writes.add(Map<String, dynamic>.from(jsonDecode(r.body)));
        return reply({
          'success': true,
          'data': {...profile, ...writes.last},
          'coverageNeedsReview': false
        });
      }
      return reply({'success': true, 'data': profile});
    }));
    await tester.pumpWidget(MaterialApp(home: StoreProfileScreen(api: api)));
    await tester.pumpAndSettle();
    expect(find.textContaining('Bengaluru'), findsOneWidget);
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Store name'), 'Updated Grocery');
    await tester.ensureVisible(find.text('Save store profile'));
    await tester.tap(find.text('Save store profile'));
    await tester.pumpAndSettle();
    expect(writes.single, {
      'name': 'Updated Grocery',
      'address': 'Shop 2 Main Road',
      'bannerImage': ''
    });
    expect(find.text('Store profile saved.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'address changes require confirmation; failures retain edits and successful retry explains coverage review',
      (tester) async {
    var writes = 0;
    final api = ProductApi(client: MockClient((r) async {
      if (r.method == 'PUT') {
        writes++;
        if (writes == 1) {
          return reply(
              {'success': false, 'message': 'Store update unavailable'}, 503);
        }
        return reply({
          'success': true,
          'data': {...profile, 'address': 'Shop 9 New Road'},
          'coverageNeedsReview': true
        });
      }
      return reply({'success': true, 'data': profile});
    }));
    await tester.pumpWidget(MaterialApp(home: StoreProfileScreen(api: api)));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextFormField, 'Pickup address'),
        'Shop 9 New Road');
    Future<void> submit() async {
      await tester.ensureVisible(find.text('Save store profile'));
      await tester.tap(find.text('Save store profile'));
      await tester.pumpAndSettle();
    }

    await submit();
    expect(writes, 0);
    expect(find.text('Confirm pickup address change'), findsOneWidget);
    await tester.tap(find.text('Update address'));
    await tester.pumpAndSettle();
    expect(writes, 1);
    expect(find.textContaining('Store update unavailable'), findsOneWidget);
    expect(find.text('Shop 9 New Road'), findsOneWidget);
    await submit();
    await tester.tap(find.text('Update address'));
    await tester.pumpAndSettle();
    expect(writes, 2);
    expect(find.textContaining('Ask operations to reconfirm'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
