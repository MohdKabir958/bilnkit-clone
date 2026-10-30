/// What a Grozo push tells the rider app. The server decides who gets which event (Docs/18, section 4);
/// the app only understands the three rider events and ignores everything else.
enum PushEvent {
  supportUpdated('SUPPORT_UPDATED'),

  /// A paid order is waiting in the pool.
  newDelivery('NEW_DELIVERY'),
  pickupReady('PICKUP_READY'),

  /// Admin handed an order to this rider.
  deliveryAssigned('DELIVERY_ASSIGNED'),

  /// The order this rider holds was cancelled.
  deliveryCancelled('DELIVERY_CANCELLED');

  const PushEvent(this.key);

  /// The `event` string in the FCM data block.
  final String key;

  static PushEvent? parse(Object? raw) {
    if (raw is! String) return null;
    final value = raw.trim();
    for (final e in PushEvent.values) {
      if (e.key == value) return e;
    }
    return null;
  }
}

/// A validated push `data` block: `{ event, orderId, v: "1" }`. Anything else is malformed.
class PushPayload {
  const PushPayload(
      {required this.event,
      required this.orderId,
      this.caseId,
      this.noteId,
      this.offerId,
      this.offerExpiresAt});

  final PushEvent event;
  final String orderId;
  final String? caseId;
  final String? noteId;
  final String? offerId;
  final DateTime? offerExpiresAt;

  /// A notification is a refresh hint, never authorization to accept an offer.
  /// Old payloads without an expiry also require loading current server offers.
  bool offerExpiredAt(DateTime now) =>
      event == PushEvent.newDelivery &&
      (offerExpiresAt == null || !offerExpiresAt!.isAfter(now));

  static final RegExp _orderIdShape = RegExp(r'^[A-Za-z0-9_\-]{1,64}$');

  /// Null for a missing / unknown / malformed payload. Never throws, whatever the map holds.
  static PushPayload? tryParse(Object? data) {
    try {
      if (data is! Map) return null;
      final event = PushEvent.parse(data['event']);
      if (event == null) return null;
      if (event == PushEvent.supportUpdated) {
        final caseId = data['caseId'], noteId = data['noteId'];
        if (data['v'] != '1' ||
            caseId is! String ||
            noteId is! String ||
            !_orderIdShape.hasMatch(caseId) ||
            !_orderIdShape.hasMatch(noteId)) {
          return null;
        }
        return PushPayload(
            event: event, orderId: '', caseId: caseId, noteId: noteId);
      }
      final orderId = data['orderId'];
      if (orderId is! String || !_orderIdShape.hasMatch(orderId.trim())) {
        return null;
      }
      // Only data format "1" is understood; a missing version is treated as 1.
      final version = data['v'];
      if (version != null && version.toString().trim() != '1') return null;
      final offerId = data['offerId'];
      final expiry = data['offerExpiresAt'];
      if (offerId != null &&
          (offerId is! String || !_orderIdShape.hasMatch(offerId))) {
        return null;
      }
      final parsedExpiry = expiry is String ? DateTime.tryParse(expiry) : null;
      if (expiry != null && parsedExpiry == null) return null;
      return PushPayload(
          event: event,
          orderId: orderId.trim(),
          offerId: offerId as String?,
          offerExpiresAt: parsedExpiry?.toUtc());
    } catch (_) {
      return null;
    }
  }

  @override
  String toString() => 'PushPayload(${event.key}, $orderId)';

  @override
  bool operator ==(Object other) =>
      other is PushPayload &&
      other.event == event &&
      other.orderId == orderId &&
      other.caseId == caseId &&
      other.noteId == noteId &&
      other.offerId == offerId &&
      other.offerExpiresAt == offerExpiresAt;

  @override
  int get hashCode =>
      Object.hash(event, orderId, caseId, noteId, offerId, offerExpiresAt);
}
