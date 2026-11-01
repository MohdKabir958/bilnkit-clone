import 'dart:async';
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:driver_app/models/partner_session.dart';
import 'package:driver_app/services/partner_auth_service.dart';
import 'package:driver_app/services/driver_api_service.dart';
import 'package:driver_app/session/session_controller.dart';

PartnerSession account(String id) => PartnerSession(
  userId: id, name: 'Synthetic $id', driverId: 'rider-$id', dutyStatus: 'OFFLINE',
  approval: PartnerApproval.approved,
);
ProfileResult valid(String id) => ProfileResult(ProfileOutcome.valid, account(id));
const form = PartnerSignupForm(name: 'Fixture', vehicleType: 'Cycle', phone: '9000000000', password: 'synthetic-fixture');

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

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late DeferredAuth auth;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    await DriverApiService.clearToken();
    await DriverApiService.saveToken('token-A');
    auth = DeferredAuth();
  });
  tearDown(() async { await DriverApiService.clearToken(); });
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
    expect(await DriverApiService.getSavedToken(), isNull);
    expect((await SharedPreferences.getInstance()).getString(SessionController.sessionPrefKey), isNull);
  });

  test('old restore rejection cannot sign out a newer successful restore', () async {
    final response = Completer<ProfileResult>();
    auth.profile = (_) => response.future;
    final controller = create();
    final pending = controller.restore();
    await started();
    await DriverApiService.saveToken('token-B');
    auth.profile = (_) async => valid('B');
    await controller.restore();
    response.complete(const ProfileResult(ProfileOutcome.unauthorized));
    await pending;
    expect(controller.session!.userId, 'B');
    expect(await DriverApiService.getSavedToken(), 'token-B');
  });

  test('old approval poll cannot overwrite another account after logout', () async {
    final controller = create();
    await controller.restore();
    final response = Completer<ProfileResult>();
    auth.profile = (_) => response.future;
    final pending = controller.refreshApproval();
    await started();
    await controller.logout();
    await DriverApiService.saveToken('token-B');
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
    expect(await DriverApiService.getSavedToken(), 'token-A');
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
    expect(await DriverApiService.getSavedToken(), isNull);
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
    expect(await DriverApiService.getSavedToken(), isNull);
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
}
