import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

abstract final class GrozoAuthConfig {
  static const mode =
      String.fromEnvironment('AUTH_MODE', defaultValue: 'legacy');
  static const preview =
      bool.fromEnvironment('AUTH_PREVIEW', defaultValue: false);
  static bool get usesClerk {
    if (!const ['legacy', 'clerk-test', 'clerk'].contains(mode))
      throw StateError('Invalid authentication mode.');
    return mode != 'legacy';
  }
}

class ClerkIdentity {
  const ClerkIdentity(
      {required this.ready,
      required this.signedIn,
      this.userId,
      this.sessionId,
      this.name,
      this.email});
  final bool ready, signedIn;
  final String? userId, sessionId, name, email;
  factory ClerkIdentity.fromMap(Map<dynamic, dynamic> map) => ClerkIdentity(
        ready: map['ready'] == true,
        signedIn: map['signedIn'] == true,
        userId: map['userId'] as String?,
        sessionId: map['sessionId'] as String?,
        name: map['name'] as String?,
        email: map['email'] as String?,
      );
}

/// Native SDK is the only owner of credentials, persistence, refresh and authentication UI.
class ClerkSessions {
  ClerkSessions({MethodChannel? channel, Stream<dynamic>? events})
      : _channel = channel ?? const MethodChannel('in.grozo/clerk'),
        _events = events;
  static final instance = ClerkSessions();
  final MethodChannel _channel;
  final Stream<dynamic>? _events;
  final identity =
      ValueNotifier(const ClerkIdentity(ready: false, signedIn: false));
  StreamSubscription<dynamic>? _subscription;
  Future<void>? _initializing;
  int _epoch = 0;
  bool _locallySignedOut = false;
  void Function(ClerkIdentity identity)? onIdentityChanged;
  Future<void> Function()? beforeAccountChange;

  void _accept(dynamic raw) {
    if (raw is! Map) return;
    final next = ClerkIdentity.fromMap(raw);
    // Late native events cannot resurrect a locally signed-out identity.
    if (_locallySignedOut && next.signedIn) return;
    final previous = identity.value;
    identity.value = next;
    if (next.userId != previous.userId ||
        next.sessionId != previous.sessionId) {
      _epoch++;
      onIdentityChanged?.call(next);
    }
  }

  Future<void> initialize() =>
      _initializing ??= _initialize().catchError((Object error) {
        _initializing = null;
        throw error;
      });
  Future<void> _initialize() async {
    _subscription ??= (_events ??
            const EventChannel('in.grozo/clerk/events')
                .receiveBroadcastStream())
        .listen(_accept, onError: (Object _) {});
    _accept(await _channel.invokeMapMethod<String, dynamic>('initialize'));
  }

  Future<bool> authenticate({String mode = 'signInOrUp'}) async {
    await initialize();
    if (!const ['signInOrUp', 'signIn', 'signUp'].contains(mode))
      throw ArgumentError('Unsupported sign-in flow.');
    try {
      final state = await _channel
          .invokeMapMethod<String, dynamic>('authenticate', {'mode': mode});
      _locallySignedOut = false;
      _accept(state);
      return identity.value.signedIn;
    } on PlatformException catch (error) {
      if (error.code == 'AUTH_CANCELLED') return false;
      rethrow;
    }
  }

  Future<String?> token({bool forceRefresh = false}) async {
    if (_locallySignedOut) return null;
    await initialize();
    final epoch = _epoch;
    final token = await _channel
        .invokeMethod<String>('getToken', {'forceRefresh': forceRefresh});
    // A response initiated under the previous account can never authenticate the next account.
    if (_locallySignedOut || epoch != _epoch) return null;
    return token;
  }

  Future<bool> signOut() async {
    _epoch++;
    _locallySignedOut = true;
    final result = await _channel.invokeMapMethod<String, dynamic>('signOut');
    _initializing = null;
    identity.value = const ClerkIdentity(ready: false, signedIn: false);
    onIdentityChanged?.call(identity.value);
    return result?['remoteRevoked'] == true;
  }

  Future<void> switchSession(String id) async {
    await beforeAccountChange?.call();
    _epoch++;
    final state = await _channel.invokeMapMethod<String, dynamic>(
        'setActiveSession', {'sessionId': id});
    _locallySignedOut = false;
    _accept(state);
  }

  Future<void> dispose() async {
    await _subscription?.cancel();
    identity.dispose();
  }
}
