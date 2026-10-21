// Explicit native-channel fixtures, not real Clerk-hosted sign-in.
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import 'package:vendor_app/services/vendor_api_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  if (!GrozoAuthConfig.usesClerk) {
    test('legacy remains the explicit default before approved cutover',
        () => expect(GrozoAuthConfig.mode, 'legacy'));
    return;
  }
  var counter = 0;
  setUpAll(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
            const MethodChannel('in.grozo/clerk/events'), (_) async => null);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(const MethodChannel('in.grozo/clerk'),
            (call) async {
      if (call.method == 'initialize') {
        return {
          'ready': true,
          'signedIn': true,
          'userId': 'user_Fixture',
          'sessionId': 'sess_Fixture'
        };
      }
      if (call.method == 'getToken') {
        return 'explicit-fixture-token-${++counter}';
      }
      if (call.method == 'signOut') {
        return {'localCleared': true, 'remoteRevoked': true};
      }
      return null;
    });
  });
  test('Clerk mode requests fresh SDK tokens for API headers', () async {
    final first = await VendorApiService.getAuthHeaders();
    final second = await VendorApiService.getAuthHeaders();
    expect(
        first['Authorization'], startsWith('Bearer explicit-fixture-token-'));
    expect(first['Authorization'], isNot(second['Authorization']));
  });
  test('saving an old Grozo JWT cannot replace the SDK session', () async {
    await VendorApiService.saveToken('legacy-token-must-never-authenticate');
    expect(await VendorApiService.getSavedToken(),
        startsWith('explicit-fixture-token-'));
  });
  test('secure logout blocks further SDK token injection', () async {
    await ClerkSessions.instance.signOut();
    expect(await VendorApiService.getSavedToken(), isNull);
    expect((await VendorApiService.getAuthHeaders())['Authorization'], isNull);
  });
}
