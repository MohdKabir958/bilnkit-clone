import 'dart:async';
import 'dart:convert';
import 'package:customer_app/providers/session_provider.dart';
import 'package:customer_app/services/customer_api_service.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

Map<String, dynamic> user(String id, String name) => {
  'id': id, 'name': name, 'role': 'STUDENT', 'phone': '9000000000',
};
http.Response profile(String id, String name) => http.Response(
  jsonEncode({'success': true, 'user': user(id, name), 'needsProfile': false}), 200,
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Completer<http.Response> response;
  late Completer<void> requested;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    await CustomerApiService.clearToken();
    await CustomerApiService.saveToken('token-A');
    response = Completer<http.Response>();
    requested = Completer<void>();
    CustomerApiService.httpClientOverride = MockClient((request) async {
      if (request.method == 'PUT') {
        requested.complete();
        return response.future;
      }
      return http.Response('{"success":true,"data":[]}', 200);
    });
  });
  tearDown(() async {
    CustomerApiService.httpClientOverride = null;
    CustomerApiService.onUnauthorized = null;
    await CustomerApiService.clearToken();
  });

  test('old profile save cannot replace a different signed-in customer', () async {
    final session = SessionProvider()..beginForTest(user('A', 'Customer A'));
    addTearDown(session.dispose);
    final pending = session.saveProfile(name: 'Changed A');
    await requested.future;
    session.expire();
    await CustomerApiService.saveToken('token-B');
    session.beginForTest(user('B', 'Customer B'));
    response.complete(profile('A', 'Changed A'));
    expect((await pending).success, isFalse);
    expect(session.user!.id, 'B');
    expect(session.user!.name, 'Customer B');
    expect(session.isSavingProfile, isFalse);
  });

  test('same-account re-login also invalidates an earlier profile save', () async {
    final session = SessionProvider()..beginForTest(user('A', 'First session'));
    addTearDown(session.dispose);
    final pending = session.saveProfile(name: 'Old edit');
    await requested.future;
    session.expire();
    session.beginForTest(user('A', 'New session'));
    response.complete(profile('A', 'Old edit'));
    expect((await pending).success, isFalse);
    expect(session.user!.name, 'New session');
  });

  test('late profile rejection does not clear the next customer token', () async {
    var expirations = 0;
    CustomerApiService.onUnauthorized = () => expirations++;
    final pending = CustomerApiService.updateProfile(name: 'Old edit');
    await requested.future;
    await CustomerApiService.saveToken('token-B');
    response.complete(http.Response('{"success":false}', 401));
    expect((await pending).success, isFalse);
    expect(expirations, 0);
    expect(await CustomerApiService.getSavedToken(), 'token-B');
  });

  test('switching accounts while headers resolve prevents the old request from being sent', () async {
    var writes = 0;
    CustomerApiService.httpClientOverride = MockClient((request) async {
      writes++;
      return http.Response('{"success":false}', 401);
    });
    final pending = CustomerApiService.updateProfile(name: 'Old edit');
    await CustomerApiService.saveToken('token-B');
    expect((await pending).success, isFalse);
    expect(writes, 0);
    expect(await CustomerApiService.getSavedToken(), 'token-B');
  });

  test('pending profile save completes safely after provider disposal', () async {
    final session = SessionProvider()..beginForTest(user('A', 'Customer A'));
    final pending = session.saveProfile(name: 'Changed A');
    await requested.future;
    session.dispose();
    response.complete(profile('A', 'Changed A'));
    expect((await pending).success, isFalse);
  });
}
