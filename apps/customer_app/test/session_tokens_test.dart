import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:kraveo_ui/kraveo_ui.dart';

void main() {
  const key = 'session_storage_security_test';
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });
  test(
      'migrates a legacy JWT once, deletes plaintext, and restores from protected storage',
      () async {
    SharedPreferences.setMockInitialValues({key: 'old-session-fixture'});
    expect(await SecureSessionTokens.read(key), 'old-session-fixture');
    expect((await SharedPreferences.getInstance()).getString(key), isNull);
    expect(await const FlutterSecureStorage().read(key: key),
        'old-session-fixture');
    expect(await SecureSessionTokens.read(key), 'old-session-fixture');
  });
  test('a protected current session wins over a stale legacy preferences value',
      () async {
    FlutterSecureStorage.setMockInitialValues({key: 'current-session-fixture'});
    SharedPreferences.setMockInitialValues({key: 'stale-session-fixture'});
    expect(await SecureSessionTokens.read(key), 'current-session-fixture');
    expect((await SharedPreferences.getInstance()).getString(key), isNull);
  });
  test('logout wins against queued token writes and prevents restoration',
      () async {
    final first = SecureSessionTokens.write(key, 'first-session-fixture');
    final second = SecureSessionTokens.write(key, 'second-session-fixture');
    final logout = SecureSessionTokens.delete(key);
    await Future.wait([first, second, logout]);
    expect(await SecureSessionTokens.read(key), isNull);
    expect(await const FlutterSecureStorage().read(key: key), isNull);
    expect((await SharedPreferences.getInstance()).getString(key), isNull);
    await SecureSessionTokens.write(key, 'new-login-fixture');
    expect(await SecureSessionTokens.read(key), 'new-login-fixture');
  });
}
