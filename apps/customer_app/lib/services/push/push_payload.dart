import 'package:kraveo_ui/kraveo_ui.dart' show BrandConfig;
import 'dart:convert';

/// The customer push events of Docs/18 (section 4). The server decides who gets which event;
/// the app only reacts to these and ignores anything else.
enum PushEvent {
  supportUpdated('SUPPORT_UPDATED'),
  orderPlaced('ORDER_PLACED'),
  orderUpdated('ORDER_UPDATED'),
  orderPreparing('ORDER_PREPARING'),
  riderAssigned('RIDER_ASSIGNED_CUSTOMER'),
  orderAccepted('ORDER_ACCEPTED'),
  orderReady('ORDER_READY'),
  orderPickedUp('ORDER_PICKED_UP'),
  riderAtGate('RIDER_AT_GATE'),
  orderDelivered('ORDER_DELIVERED'),
  orderCancelled('ORDER_CANCELLED'),
  refundProcessed('REFUND_PROCESSED');

  const PushEvent(this.key);

  /// Value of `data.event`.
  final String key;

  static PushEvent? fromKey(String key) {
    for (final e in PushEvent.values) {
      if (e.key == key) return e;
    }
    return null;
  }

  /// Events the student must notice even with the app open on another screen (they use the
  /// high-importance `order_attention` channel on the server too).
  bool get needsAttention =>
      this == supportUpdated ||
      this == orderUpdated ||
      this == riderAtGate ||
      this == orderCancelled ||
      this == orderPickedUp;

  /// Android channel id, exactly as in the contract (section 5).
  String get channelId =>
      needsAttention ? PushChannels.orderAttention : PushChannels.orderUpdates;

  /// Fallback copy for a locally shown banner when the message carries no notification block.
  /// Never contains the delivery verification code (it is only shown inside the app).
  String get fallbackTitle => switch (this) {
        supportUpdated => 'Support has replied',
        orderUpdated => 'Review an item change',
        orderPlaced => 'Order placed',
        orderPreparing => 'Packing your order',
        riderAssigned => 'Delivery partner assigned',
        orderAccepted => 'Order accepted',
        orderReady => 'Order is packed',
        orderPickedUp => 'On the way',
        riderAtGate => 'Your rider has arrived',
        orderDelivered => 'Delivered',
        orderCancelled => 'Order cancelled',
        refundProcessed => 'Refund processed',
      };

  String get fallbackBody => switch (this) {
        supportUpdated => 'Open Help and requests to read your private update.',
        orderUpdated =>
          'Open your order to review the store’s proposed item change.',
        orderPlaced =>
          'Your order has been saved. Complete payment to confirm it.',
        orderPreparing => 'Your store is packing your items.',
        riderAssigned => 'Open the app to follow your delivery.',
        orderAccepted => 'Your store has accepted the order.',
        orderReady => 'Waiting for a rider.',
        orderPickedUp => 'Your order is on its way.',
        riderAtGate => 'Open ${BrandConfig.name} to see your delivery code.',
        orderDelivered => 'Your items are here. Rate your order.',
        orderCancelled => 'Open ${BrandConfig.name} for details.',
        refundProcessed => 'Your refund is on its way.',
      };
}

/// Android notification channel ids (contract section 5). They must never change after release.
class PushChannels {
  PushChannels._();
  static const String orderUpdates = 'order_updates';
  static const String orderAttention = 'order_attention';
}

/// What a tap on a notification (or a foreground message) carries: `{event, orderId, v:"1"}`.
class PushPayload {
  const PushPayload(
      {required this.event, required this.orderId, this.caseId, this.noteId});

  final PushEvent event;
  final String orderId;
  final String? caseId;
  final String? noteId;
  String get referenceId => caseId ?? orderId;

  static const String version = '1';
  static final RegExp _idPattern = RegExp(r'^[A-Za-z0-9_-]{1,64}$');

  /// Validates an FCM `data` map. Returns null for anything that is not a well-formed customer
  /// event (missing/odd keys, unknown event, another payload version, a malformed order id),
  /// so a bad message can never route anywhere or throw.
  static PushPayload? tryParse(Object? data) {
    if (data is! Map) return null;
    final event = data['event'];
    final orderId = data['orderId'];
    final v = data['v'];
    if (event is! String || orderId is! String || v is! String) return null;
    if (v != version) return null;
    final parsed = PushEvent.fromKey(event);
    if (parsed == null) return null;
    if (parsed == PushEvent.supportUpdated) {
      final caseId = data['caseId'], noteId = data['noteId'];
      if (caseId is! String ||
          noteId is! String ||
          !_idPattern.hasMatch(caseId) ||
          !_idPattern.hasMatch(noteId)) {
        return null;
      }
      return PushPayload(
          event: parsed, orderId: '', caseId: caseId, noteId: noteId);
    }
    if (!_idPattern.hasMatch(orderId)) return null;
    return PushPayload(event: parsed, orderId: orderId);
  }

  /// String stored in a locally shown notification so its tap can be routed (same shape as FCM data).
  String encode() => jsonEncode({
        'event': event.key,
        'orderId': orderId,
        'v': version,
        if (caseId != null) 'caseId': caseId,
        if (noteId != null) 'noteId': noteId
      });

  /// Reverse of [encode]; null for null, non-JSON or invalid content.
  static PushPayload? tryDecode(String? raw) {
    if (raw == null || raw.isEmpty || raw.length > 512) return null;
    try {
      return tryParse(jsonDecode(raw));
    } catch (_) {
      return null;
    }
  }
}
