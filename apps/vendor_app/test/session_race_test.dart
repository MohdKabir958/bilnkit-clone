import 'dart:async';
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:vendor_app/services/location/location_capture.dart';
import 'package:vendor_app/services/location/vendor_location_api.dart';
import 'package:vendor_app/services/vendor_backend.dart';
import 'package:vendor_app/models/partner_session.dart';
import 'package:vendor_app/services/partner_auth_service.dart';
import 'package:vendor_app/services/vendor_api_service.dart';
import 'package:vendor_app/session/session_controller.dart';

PartnerSession account(String id) => PartnerSession(
  userId: id, name: 'Synthetic $id', vendorId: 'store-$id',
  approval: PartnerApproval.approved,
);
ProfileResult valid(String id) => ProfileResult(ProfileOutcome.valid, account(id));
const form = PartnerSignupForm(ownerName: 'Fixture', restaurantName: 'Fixture store', address: 'Fixture street', phone: '9000000000', password: 'synthetic-fixture');

class DeferredAuth implements PartnerAuthService {
  Future<ProfileResult> Function(String) profile = (_) async => valid('A');
  Future<LoginResult> Function() loginResult = () async => LoginResult.success(token: 'token-A', session: account('A'));
  Future<SignupResult> Function() signupResult = () async => SignupResult.success(token: 'token-A', session: account('A'));
  Future<SignupResult> Function() resubmitResult = () async => SignupResult.success(session: account('A'));
  @override
  Future<ProfileResult> fetchProfile(String token) => profile(token);
  @override
  Future<LoginResult> login({required String phone, required String password}) => loginResult();
  @override
  Future<SignupResult> signUp(PartnerSignupForm form) => signupResult();
  @override
  Future<SignupResult> resubmit(String token, PartnerSignupForm form) => resubmitResult();
  @override
  Future<void> logout(String token) async {}
}

class DeferredLocation implements VendorLocationApi {
  final response = Completer<ApiResult<SavedLocation>>();
  @override
  Future<ApiResult<SavedLocation>> save({required double lat, required double lng,
    double? accuracyM, String? vendorId}) => response.future;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late DeferredAuth auth;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    await VendorApiService.clearToken();
    await VendorApiService.saveToken('token-A');
    auth = DeferredAuth();
  });
  tearDown(() async { await VendorApiService.clearToken(); });
  SessionController create() {
    final controller = SessionController(auth: auth);
    addTearDown(controller.dispose);
    return controller;
  }
  Future<void> started() => Future<void>.delayed(Duration.zero);

  test('late restore success cannot restore a signed-out account or persisted profile', () async {
    final response = Completer<ProfileResult>();
    auth.profile = (_) => response.future;
    final controller = create();
    final pending = controller.restore();
    await started();
    await controller.logout();
    response.complete(valid('A'));
    await pending;
    expect(controller.status, SessionStatus.signedOut);
    expect(controller.session, isNull);
    expect(await VendorApiService.getSavedToken(), isNull);
    expect((await SharedPreferences.getInstance()).getString(SessionController.sessionPrefKey), isNull);
  });

  test('old restore rejection cannot sign out a newer successful restore', () async {
    final response = Completer<ProfileResult>();
    auth.profile = (_) => response.future;
    final controller = create();
    final pending = controller.restore();
    await started();
    await VendorApiService.saveToken('token-B');
    auth.profile = (_) async => valid('B');
    await controller.restore();
    response.complete(const ProfileResult(ProfileOutcome.unauthorized));
    await pending;
    expect(controller.session!.userId, 'B');
    expect(await VendorApiService.getSavedToken(), 'token-B');
  });

  test('old approval poll cannot overwrite another account after logout', () async {
    final controller = create();
    await controller.restore();
    final response = Completer<ProfileResult>();
    auth.profile = (_) => response.future;
    final pending = controller.refreshApproval();
    await started();
    await controller.logout();
    await VendorApiService.saveToken('token-B');
    auth.profile = (_) async => valid('B');
    await controller.restore();
    response.complete(valid('A'));
    expect(await pending, isFalse);
    expect(controller.session!.userId, 'B');
    final raw = (await SharedPreferences.getInstance()).getString(SessionController.sessionPrefKey)!;
    expect(jsonDecode(raw)['userId'], 'B');
  });

  test('an older overlapping approval rejection cannot invalidate the latest profile', () async {
    final controller = create();
    await controller.restore();
    final response = Completer<ProfileResult>();
    auth.profile = (_) => response.future;
    final pending = controller.refreshApproval();
    await started();
    auth.profile = (_) async => valid('A');
    await controller.refreshApproval();
    response.complete(const ProfileResult(ProfileOutcome.unauthorized));
    expect(await pending, isFalse);
    expect(controller.status, SessionStatus.signedIn);
    expect(await VendorApiService.getSavedToken(), 'token-A');
  });

  test('late login success cannot save credentials after logout', () async {
    final response = Completer<LoginResult>();
    auth.loginResult = () => response.future;
    final controller = create();
    final pending = controller.login('9000000000', 'synthetic-fixture');
    await controller.logout();
    response.complete(LoginResult.success(token: 'token-A', session: account('A')));
    expect((await pending).ok, isFalse);
    expect(controller.status, SessionStatus.signedOut);
    expect(await VendorApiService.getSavedToken(), isNull);
  });

  test('late signup success cannot save credentials after logout', () async {
    final response = Completer<SignupResult>();
    auth.signupResult = () => response.future;
    final controller = create();
    final pending = controller.signUp(form);
    await controller.logout();
    response.complete(SignupResult.success(token: 'token-A', session: account('A')));
    expect((await pending).ok, isFalse);
    expect(controller.status, SessionStatus.signedOut);
    expect(await VendorApiService.getSavedToken(), isNull);
  });

  test('late resubmission cannot repopulate a signed-out account', () async {
    final controller = create();
    await controller.restore();
    final response = Completer<SignupResult>();
    auth.resubmitResult = () => response.future;
    final pending = controller.resubmit(form);
    await started();
    await controller.logout();
    response.complete(SignupResult.success(session: account('A')));
    expect((await pending).ok, isFalse);
    expect(controller.session, isNull);
  });

  test('pending restore finishes safely after controller disposal', () async {
    final response = Completer<ProfileResult>();
    auth.profile = (_) => response.future;
    final controller = SessionController(auth: auth);
    final pending = controller.restore();
    await started();
    controller.dispose();
    response.complete(valid('A'));
    await expectLater(pending, completes);
    expect((await SharedPreferences.getInstance()).getString(SessionController.sessionPrefKey), isNull);
  });

  test('the most recently selected store wins when responses arrive out of order', () async {
    final controller = create();
    await controller.restore();
    final first = Completer<http.Response>();
    final second = Completer<http.Response>();
    http.Response store(String id) => http.Response(jsonEncode({
      'user': {'id': 'A', 'name': 'Synthetic A', 'role': 'VENDOR'},
      'approvalStatus': 'APPROVED', 'vendor': {'id': id, 'name': id},
    }), 200);
    await http.runWithClient(() async {
      final one = controller.selectStore('first');
      await started();
      final two = controller.selectStore('second');
      await started();
      second.complete(store('second'));
      await two;
      first.complete(store('first'));
      await one;
      expect(controller.session!.vendorId, 'second');
    }, () => MockClient((request) => request.url.path.endsWith('/first') ? first.future : second.future));
  });

  test('a location save from the previous account cannot update the new store', () async {
    final location = DeferredLocation();
    final controller = SessionController(auth: auth, locationApi: location);
    addTearDown(controller.dispose);
    await controller.restore();
    final pending = controller.saveRestaurantLocation(const LocationFix(12.9, 77.5, 10));
    await started();
    await controller.logout();
    await VendorApiService.saveToken('token-B');
    auth.profile = (_) async => valid('B');
    await controller.restore();
    location.response.complete(const ApiResult.success(SavedLocation(lat: 12.9, lng: 77.5)));
    expect((await pending).ok, isFalse);
    expect(controller.session!.userId, 'B');
    expect(controller.session!.lat, isNull);
  });
}
