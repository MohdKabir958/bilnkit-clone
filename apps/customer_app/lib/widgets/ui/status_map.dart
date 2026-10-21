import 'package:kraveo_ui/kraveo_ui.dart';
import '../../models/order.dart';

/// Maps the server's order statuses onto the shared Grozo status language.
extension OrderStatusUi on OrderProgressStatus {
  KStatus get kStatus => switch (this) {
        OrderProgressStatus.placed => KStatus.placed,
        OrderProgressStatus.accepted => KStatus.accepted,
        OrderProgressStatus.preparing => KStatus.preparing,
        OrderProgressStatus.readyForPickup => KStatus.ready,
        OrderProgressStatus.pickedUp => KStatus.pickedUp,
        OrderProgressStatus.arrivedAtGate => KStatus.atGate,
        OrderProgressStatus.delivered => KStatus.delivered,
        OrderProgressStatus.cancelled => KStatus.cancelled,
      };

  /// Short label for pills.
  String get pillLabel => switch (this) {
        OrderProgressStatus.placed => 'Placed',
        OrderProgressStatus.accepted => 'Accepted',
        OrderProgressStatus.preparing => 'Preparing',
        OrderProgressStatus.readyForPickup => 'Ready',
        OrderProgressStatus.pickedUp => 'On the way',
        OrderProgressStatus.arrivedAtGate => 'At your door',
        OrderProgressStatus.delivered => 'Delivered',
        OrderProgressStatus.cancelled => 'Cancelled',
      };

  /// Human headline for the tracking hero.
  String get headline => switch (this) {
        OrderProgressStatus.placed => 'Waiting for the store',
        OrderProgressStatus.accepted => 'Store accepted',
        OrderProgressStatus.preparing => 'Packing your order',
        OrderProgressStatus.readyForPickup => 'Packed and ready',
        OrderProgressStatus.pickedUp => 'On the way to you',
        OrderProgressStatus.arrivedAtGate => 'Your rider is at your door',
        OrderProgressStatus.delivered => 'Delivered. Enjoy!',
        OrderProgressStatus.cancelled => 'Order cancelled',
      };

  /// Always tell the user what happens next.
  String get nextHint => switch (this) {
        OrderProgressStatus.placed => 'Next: the store confirms your order.',
        OrderProgressStatus.accepted => 'Next: the store starts packing.',
        OrderProgressStatus.preparing =>
          'Next: a rider picks it up once it is packed.',
        OrderProgressStatus.readyForPickup =>
          'Next: your rider collects it from the store.',
        OrderProgressStatus.pickedUp =>
          'Next: meet your rider at your door. Your OTP appears when they arrive.',
        OrderProgressStatus.arrivedAtGate =>
          'Tell your rider the OTP below to get your groceries.',
        OrderProgressStatus.delivered =>
          'All done. Tell us how your delivery went.',
        OrderProgressStatus.cancelled =>
          'Nothing will be delivered for this order.',
      };

  /// Status-based progress for bars and the route strip (no invented distances or timings).
  double get progressValue => switch (this) {
        OrderProgressStatus.placed => 0.08,
        OrderProgressStatus.accepted => 0.22,
        OrderProgressStatus.preparing => 0.38,
        OrderProgressStatus.readyForPickup => 0.52,
        OrderProgressStatus.pickedUp => 0.72,
        OrderProgressStatus.arrivedAtGate => 0.95,
        OrderProgressStatus.delivered => 1.0,
        OrderProgressStatus.cancelled => 0.0,
      };

  bool get isLive => !isTerminal;
}

/// Headline that also accounts for payment (an unpaid order is not "waiting for the restaurant").
/// A combined order says "restaurants" where the single order says "restaurant".
String orderHeadline(OrderModel o, {bool confirmingPayment = false}) {
  if (o.awaitsPayment) {
    return confirmingPayment
        ? 'Confirming your payment'
        : 'Payment not completed';
  }
  if (o.isGroup) {
    switch (o.status) {
      case OrderProgressStatus.placed:
        return 'Waiting for the stores';
      case OrderProgressStatus.accepted:
        return 'Stores accepted';
      default:
        break;
    }
  }
  return o.status.headline;
}

/// What happens next for a combined order (several restaurants, one rider).
String groupNextHint(OrderProgressStatus status) => switch (status) {
      OrderProgressStatus.placed =>
        'Next: every store confirms its part. If one can\'t, the whole order is cancelled and refunded.',
      OrderProgressStatus.accepted => 'Next: the stores start packing.',
      OrderProgressStatus.preparing =>
        'Next: a rider picks everything up once it is packed.',
      OrderProgressStatus.readyForPickup =>
        'Next: your rider collects it from each store.',
      _ => status.nextHint,
    };
