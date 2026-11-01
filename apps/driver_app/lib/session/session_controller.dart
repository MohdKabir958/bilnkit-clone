import 'package:kraveo_ui/kraveo_ui.dart' show GrozoAuthConfig, ClerkSessions;
import 'dart:async';
import 'dart:convert';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/partner_session.dart';
import '../services/partner_auth_service.dart';
import '../services/driver_api_service.dart';
import '../state/rider_controller.dart' show RiderController;

enum SessionStatus {
  /// Validating a stored token.
  checking,
  signedOut,

  /// A token is stored but Grozo could not be reached to validate it.
  unreachable,
  signedIn,
}

/// Owns the partner's login lifecycle. The JWT itself is stored by [DriverApiService] (which
/// injects it into every request); this keeps the who-am-I basics next to it. A password is
/// only ever passed straight through to the server and is never stored.
class SessionController extends ChangeNotifier {
  SessionController({PartnerAuthService? auth})
      : auth = auth ?? ApiPartnerAuthService() {
    if (GrozoAuthConfig.usesClerk) {
      ClerkSessions.instance.onIdentityChanged = (_) {
        _sessionEpoch++;
        if (_session != null) unawaited(expire());
      };
    }
  }

  static const String sessionPrefKey = 'kraveo_driver_session';

  final PartnerAuthService auth;

  /// Set by the push layer. Runs at the start of [logout], while the login token still exists, so this phone can be
  /// removed from the rider's account on the server. Best effort and time-boxed; it never blocks the logout.
  Future<void> Function()? beforeSignOut;

  SessionStatus _status = SessionStatus.checking;
  PartnerSession? _session;
  bool _expiring = false;
  bool _disposed = false;
  int _sessionEpoch = 0;
  int _profileRequest = 0;

  // Network responses belong to the account and request that started them.
  bool _isCurrent(int epoch) => !_disposed && epoch == _sessionEpoch;
  String? _signOutNotice;

  /// The duty Grozo reported at the last successful login / profile read, and when that request was sent.
  /// A separate notifier so the work screen can mirror it without rebuilding the whole app on every poll.
  final ValueNotifier<DutyReading?> dutyReading =
      ValueNotifier<DutyReading?>(null);

  SessionStatus get status => _status;
  PartnerSession? get session => _session;

  /// A one-off explanation for the login screen after the session was ended for a reason the rider should
  /// know (the account was paused). Reading it clears it.
  String? takeSignOutNotice() {
    final n = _signOutNotice;
    _signOutNotice = null;
    return n;
  }

  void _set(SessionStatus status, [PartnerSession? session]) {
    if (_disposed) return;
    _status = status;
    _session = session;
    notifyListeners();
  }

  Future<PartnerSession?> _loadStored() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(sessionPrefKey);
      if (raw == null) return null;
      return PartnerSession.fromStoredJson(jsonDecode(raw));
    } catch (_) {
      return null;
    }
  }

  Future<void> _persist(PartnerSession session) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(sessionPrefKey, jsonEncode(session.toJson()));
    } catch (_) {}
  }

  Future<void> _clearAll() async {
    await DriverApiService.clearToken();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(sessionPrefKey);
      // "On duty" belongs to the rider who chose it, not to the phone: the next login starts from what Grozo says.
      await prefs.remove(RiderController.dutyPrefKey);
    } catch (_) {}
  }

  Future<void> _forgetDuty() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(RiderController.dutyPrefKey);
    } catch (_) {}
  }

  /// `GET /partner/me` carries the account, the rider profile and the approval state. If a response ever lacks
  /// the rider profile, keep the details we already stored and take only the fresh account + approval fields.
  static PartnerSession _mergeFresh(
      PartnerSession? stored, PartnerSession fresh) {
    if (fresh.requiresApplication ||
        stored == null ||
        stored.userId != fresh.userId ||
        fresh.driverId != null) {
      return fresh;
    }
    return stored.withUserFrom(fresh).copyWith(
          approval: fresh.approval,
          rejectionReason: fresh.rejectionReason,
          clearReason: fresh.rejectionReason == null,
        );
  }

  /// App start: validate the stored token, or fall through to the login screen.
  Future<void> restore() async {
    if (_disposed) return;
    // Initialization may emit the first identity event; start the request after it.
    if (GrozoAuthConfig.usesClerk) {
      try {
        await ClerkSessions.instance.initialize();
      } catch (_) {
        if (!_disposed) _set(SessionStatus.unreachable);
        return;
      }
    }
    if (_disposed) return;
    final epoch = ++_sessionEpoch;
    String? token;
    try {
      token = await DriverApiService.getSavedToken();
    } catch (_) {
      if (!_isCurrent(epoch)) return;
      _set(SessionStatus.unreachable);
      return;
    }
    if (!_isCurrent(epoch)) return;
    if (token == null || token.isEmpty) {
      _set(SessionStatus.signedOut);
      return;
    }
    final stored = GrozoAuthConfig.usesClerk ? null : await _loadStored();
    final askedAt = DateTime.now();
    if (!_isCurrent(epoch)) return;
    final result = await auth.fetchProfile(token);
    if (!_isCurrent(epoch)) return;
    switch (result.outcome) {
      case ProfileOutcome.valid:
        final merged = _mergeFresh(stored, result.session!);
        await _persist(merged);
        if (!_isCurrent(epoch)) return;
        if (merged.approval != PartnerApproval.approved) await _forgetDuty();
        if (!_isCurrent(epoch)) return;
        dutyReading.value = DutyReading(merged.dutyStatus, askedAt);
        _set(SessionStatus.signedIn, merged);
      case ProfileOutcome.unauthorized:
        await _clearAll();
        if (!_isCurrent(epoch)) return;
        if (result.suspended) {
          _signOutNotice = DriverApiService.accountPausedMessage;
        }
        _set(SessionStatus.signedOut);
      case ProfileOutcome.unreachable:
        // Keep the token: a dropped network must not log a rider off mid-shift.
        _set(SessionStatus.unreachable, stored);
    }
  }

  Future<void> retryRestore() {
    _set(SessionStatus.checking, _session);
    return restore();
  }

  /// Signs in with phone + password. On success the token and basics are saved and the
  /// status flips to signed-in; on failure the result tells the screen what to show.
  Future<LoginResult> login(String phone, String password) async {
    final askedAt = DateTime.now();
    final epoch = ++_sessionEpoch;
    final result = await auth.login(phone: phone, password: password);
    if (!_isCurrent(epoch)) {
      return const LoginResult.failure(LoginFailure.invalidCredentials);
    }
    if (result.ok) {
      await DriverApiService.saveToken(result.token!);
      if (!_isCurrent(epoch)) return const LoginResult.failure(LoginFailure.invalidCredentials);
      await _persist(result.session!);
      if (!_isCurrent(epoch)) return const LoginResult.failure(LoginFailure.invalidCredentials);
      dutyReading.value = DutyReading(result.session!.dutyStatus, askedAt);
      _set(SessionStatus.signedIn, result.session);
    }
    return result;
  }

  /// Creates a rider account. On success the new rider is signed in straight away and the gate
  /// shows the "waiting for approval" screen.
  Future<SignupResult> signUp(PartnerSignupForm form) async {
    final epoch = ++_sessionEpoch;
    final result = await auth.signUp(form);
    if (!_isCurrent(epoch)) return const SignupResult.failure(SignupFailure.unauthorized);
    if (result.ok && result.token != null) {
      await DriverApiService.saveToken(result.token!);
      if (!_isCurrent(epoch)) return const SignupResult.failure(SignupFailure.unauthorized);
      await _persist(result.session!);
      if (!_isCurrent(epoch)) return const SignupResult.failure(SignupFailure.unauthorized);
      _set(SessionStatus.signedIn, result.session);
    }
    return result;
  }

  /// Fixes and re-sends an application that is pending or was rejected.
  Future<SignupResult> resubmit(PartnerSignupForm form) async {
    final epoch = _sessionEpoch;
    _profileRequest++;
    final token = await DriverApiService.getSavedToken();
    if (token == null || token.isEmpty) {
      return const SignupResult.failure(SignupFailure.unauthorized);
    }
    if (!_isCurrent(epoch)) return const SignupResult.failure(SignupFailure.unauthorized);
    final result = await auth.resubmit(token, form);
    if (!_isCurrent(epoch)) return const SignupResult.failure(SignupFailure.unauthorized);
    if (result.ok) {
      final answered = result.session;
      if (answered != null) {
        final merged = _mergeFresh(_session, answered);
        await _persist(merged);
        if (!_isCurrent(epoch)) return const SignupResult.failure(SignupFailure.unauthorized);
        _set(SessionStatus.signedIn, merged);
      } else {
        // Grozo accepted it (200) without sending the account back: read the new state ourselves.
        await refreshApproval();
      }
    } else if (result.failure == SignupFailure.unauthorized) {
      await expire();
    }
    return result;
  }

  /// Asks Grozo where the application stands. Returns true when something changed. Safe to call
  /// from a timer: a network problem keeps the current state.
  Future<bool> refreshApproval() async {
    if (_disposed || _status != SessionStatus.signedIn) return false;
    final epoch = _sessionEpoch;
    final request = ++_profileRequest;
    final token = await DriverApiService.getSavedToken();
    if (token == null || token.isEmpty) return false;
    final askedAt = DateTime.now();
    if (!_isCurrent(epoch) || request != _profileRequest) return false;
    final result = await auth.fetchProfile(token);
    if (!_isCurrent(epoch) || request != _profileRequest) return false;
    switch (result.outcome) {
      case ProfileOutcome.valid:
        final before = _session;
        final fresh = _mergeFresh(before, result.session!);
        final changed = before == null ||
            before.approval != fresh.approval ||
            before.rejectionReason != fresh.rejectionReason;
        // Details (vehicle, plate, UPI...) that changed also need the screens to hear about it (the "update details"
        // form must not open with stale values), but they are not an "approval changed" answer for the caller.
        final detailsChanged = before == null || !before.sameDetailsAs(fresh);
        await _persist(fresh);
        if (!_isCurrent(epoch) || request != _profileRequest) return false;
        if (fresh.approval != PartnerApproval.approved) await _forgetDuty();
        if (!_isCurrent(epoch) || request != _profileRequest) return false;
        _session = fresh;
        dutyReading.value = DutyReading(fresh.dutyStatus, askedAt);
        if (changed || detailsChanged) notifyListeners();
        return changed;
      case ProfileOutcome.unauthorized:
        await expire(suspended: result.suspended);
        return true;
      case ProfileOutcome.unreachable:
        return false;
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _sessionEpoch++;
    if (GrozoAuthConfig.usesClerk) {
      ClerkSessions.instance.onIdentityChanged = null;
    }
    dutyReading.dispose();
    super.dispose();
  }

  /// A 401 came back from an authenticated call: drop the token, show login.
  Future<void> expire({bool suspended = false}) async {
    _sessionEpoch++;
    if (_disposed) return;
    if (_status == SessionStatus.signedOut || _expiring) return;
    _expiring = true;
    try {
      await _clearAll();
      if (suspended) _signOutNotice = DriverApiService.accountPausedMessage;
      _set(SessionStatus.signedOut);
    } finally {
      _expiring = false;
    }
  }

  /// Signs out. The server call is best effort and bounded, so a dead network cannot trap
  /// the partner in the app; local data is always cleared.
  Future<void> logout({Future<void> Function()? beforeClear}) async {
    _sessionEpoch++;
    if (_disposed) return;
    final token = await DriverApiService.getSavedToken();
    final hook = beforeSignOut;
    if (hook != null) {
      try {
        await hook().timeout(const Duration(seconds: 5));
      } catch (_) {}
    }
    try {
      await Future.wait<void>([
        if (beforeClear != null) beforeClear(),
        if (token != null && token.isNotEmpty) auth.logout(token),
      ]).timeout(const Duration(seconds: 5));
    } catch (_) {}
    if (GrozoAuthConfig.usesClerk) await ClerkSessions.instance.signOut();
    await _clearAll();
    _set(SessionStatus.signedOut);
  }
}

/// What Grozo said about the rider's duty ([status]: `ONLINE`, `IN_TRANSIT`, `OFFLINE` or null when it did not
/// say) in an answer to a request sent at [asOf].
class DutyReading {
  const DutyReading(this.status, this.asOf);
  final String? status;
  final DateTime asOf;
}

/// Makes the [SessionController] reachable from any screen, including pushed routes.
class SessionScope extends InheritedNotifier<SessionController> {
  const SessionScope(
      {super.key, required SessionController controller, required super.child})
      : super(notifier: controller);

  /// The controller, or null when there is no scope (screens pumped alone in tests).
  static SessionController? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<SessionScope>()?.notifier;
}
