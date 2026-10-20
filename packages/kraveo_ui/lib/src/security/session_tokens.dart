import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// JWTs are stored in platform-protected storage. The old preferences key is read
/// only for one-way migration and then erased; new tokens are never written there.
class SecureSessionTokens {
  static const _storage = FlutterSecureStorage();
  static final _queues = <String, Future<void>>{};
  static final _epochs = <String, int>{};
  static Future<void> _serial(String key, Future<void> Function() action) {
    late final Future<void> next;
    next = (_queues[key] ?? Future<void>.value())
        .catchError((Object _) {})
        .then((_) => action())
        .whenComplete(() {
          if (identical(_queues[key], next)) _queues.remove(key);
        });
    _queues[key] = next;
    return next;
  }

  static String _revoked(String key) => '$key.revoked';
  static Future<String?> read(String key) async {
    final epoch = _epochs[key] ?? 0;
    await _queues[key]?.catchError((Object _) {});
    if (epoch != (_epochs[key] ?? 0)) return null;
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(_revoked(key)) == true) return null;
    String? protected;
    try {
      protected = await _storage.read(key: key);
    } catch (_) {
      /* Memory-only until platform storage is available. */
    }
    if (epoch != (_epochs[key] ?? 0)) return null;
    if (protected != null && protected.isNotEmpty) {
      await prefs.remove(key);
      return protected;
    }
    final legacy = prefs.getString(key);
    if (legacy != null && legacy.isNotEmpty) {
      await write(key, legacy);
      return legacy;
    }
    return protected;
  }

  static Future<void> write(String key, String token) {
    _epochs[key] = (_epochs[key] ?? 0) + 1;
    return _serial(key, () async {
      bool persisted = false;
      try {
        await _storage.write(key: key, value: token);
        persisted = true;
      } catch (_) {
        /* Keep only the app service's in-memory session. */
      }
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(key);
      // If a write fails, an older protected token must not restore another account.
      await prefs.setBool(_revoked(key), !persisted);
    });
  }

  static Future<void> delete(String key) {
    _epochs[key] = (_epochs[key] ?? 0) + 1;
    return _serial(key, () async {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_revoked(key), true);
      await prefs.remove(key);
      try {
        await _storage.delete(key: key);
      } catch (_) {
        /* Tombstone prevents reuse even if deletion is temporarily unavailable. */
      }
    });
  }
}
