import 'package:kraveo_ui/kraveo_ui.dart' show BrandConfig;
import 'package:flutter/material.dart';
import 'package:kraveo_ui/kraveo_ui.dart' show SupportCenter;
import 'product_api.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

/// Where a restaurant asks Grozo for help. Email only: there is no helpline number yet.
const String kSupportEmail = BrandConfig.supportEmail;

/// Opens a link outside the app. True when something opened.
typedef MailOpener = Future<bool> Function(Uri uri);

Future<bool> _launchMail(Uri uri) async {
  try {
    return await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (_) {
    return false;
  }
}

/// The "Email Grozo support" action. Replaced in tests.
class SupportContact {
  @visibleForTesting
  static MailOpener opener = _launchMail;

  static Uri mailtoUri(
          [String subject = '${BrandConfig.name} store partner help']) =>
      Uri.parse(
          'mailto:$kSupportEmail?subject=${Uri.encodeComponent(subject)}');

  /// Opens the phone's mail app with a new message to Grozo support. When there is no mail app, the address is
  /// copied instead and the owner is told so.
  static Future<void> openEmail(BuildContext context) async {
    if (kSupportEmail.isEmpty) {
      await Navigator.push(
          context,
          MaterialPageRoute(
              builder: (_) => SupportCenter(call: ProductApi().call)));
      return;
    }
    final messenger = ScaffoldMessenger.maybeOf(context);
    var opened = false;
    try {
      opened = await opener(mailtoUri());
    } catch (_) {}
    if (opened) return;
    try {
      await Clipboard.setData(const ClipboardData(text: kSupportEmail));
    } catch (_) {}
    messenger
      ?..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(
        content: Text(
            'No email app found. Address copied: $kSupportEmail  ·  ईमेल पता कॉपी हो गया'),
        duration: Duration(seconds: 5),
      ));
  }
}
