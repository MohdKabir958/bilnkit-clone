import 'package:kraveo_ui/kraveo_ui.dart' show BrandConfig;
/// How a rider reaches Grozo when something goes wrong on a delivery (locked code, cancelled order
/// in hand, a question about the account).
///
/// Grozo has no staffed phone line yet, so support is by email only. The old placeholder phone
/// number was removed on purpose: a number nobody answers is worse than none. For a real emergency
/// the rider dials the national emergency number ([emergencyNumber]).
class SupportConfig {
  static const String email = BrandConfig.supportEmail;

  /// India's single emergency number (police, ambulance, fire).
  static const String emergencyNumber = '112';
}
