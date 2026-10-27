import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'clerk_sessions.dart';
import '../theme/tokens.dart';
import '../widgets/brand.dart';

enum ClerkEntryRole { customer, vendor, delivery }

/// The native Clerk SDK owns sign-in. Business access is checked by [onContinue].
class ClerkEntryScreen extends StatefulWidget {
  const ClerkEntryScreen(
      {super.key,
      required this.appName,
      this.role = ClerkEntryRole.customer,
      this.onContinue,
      this.onApply,
      this.accessError,
      this.preview = false,
      this.client});
  final String appName;
  final ClerkEntryRole role;
  final Future<void> Function()? onContinue;
  final VoidCallback? onApply;

  /// Explains a failed business-profile check without signing out of Clerk.
  final String? accessError;
  final bool preview;
  final ClerkSessions? client;
  @override
  State<ClerkEntryScreen> createState() => _ClerkEntryScreenState();
}

class _ClerkEntryScreenState extends State<ClerkEntryScreen> {
  ClerkSessions get client => widget.client ?? ClerkSessions.instance;
  bool busy = false;
  String? message;
  @override
  void initState() {
    super.initState();
    _initialize();
  }

  Future<void> _initialize() async {
    try {
      await client.initialize();
    } catch (_) {
      if (mounted) {
        setState(() => message =
            'Secure sign-in could not connect. Check your internet and retry.');
      }
    }
  }

  Future<void> _run(Future<void> Function() work) async {
    if (busy) {
      return;
    }
    setState(() {
      busy = true;
      message = null;
    });
    try {
      await work();
    } on PlatformException catch (error) {
      if (mounted) {
        setState(
            () => message = error.message ?? 'Secure sign-in is unavailable.');
      }
    } catch (_) {
      if (mounted) {
        setState(() => message =
            'Grozo could not verify access. Check the connection and your account permissions, then retry.');
      }
    } finally {
      if (mounted) {
        setState(() => busy = false);
      }
    }
  }

  Future<void> _authenticate(String mode) => _run(() async {
        if (await client.authenticate(mode: mode)) {
          await widget.onContinue?.call();
        }
      });

  @override
  Widget build(BuildContext context) {
    final k = context.k;
    final theme = Theme.of(context).textTheme;
    final (headline, subtitle, icon, steps, continueLabel) =
        switch (widget.role) {
      ClerkEntryRole.customer => (
          'Your neighbourhood,\ndelivered.',
          'Discover local shops and make room for the things you love.',
          Icons.shopping_bag_outlined,
          ['Find nearby shops', 'Fill your basket', 'Delivered to your door'],
          'Continue to shopping'
        ),
      ClerkEntryRole.vendor => (
          'Your shop.\nReady for business.',
          'A simpler way to manage your products, orders and store.',
          Icons.storefront_outlined,
          [
            'Keep stock updated',
            'Accept and pack orders',
            'Hand over to a rider'
          ],
          'Open my store'
        ),
      ClerkEntryRole.delivery => (
          'Pick up nearby.\nDeliver with Grozo.',
          'Your next delivery, with clear pickup and doorstep directions.',
          Icons.delivery_dining_outlined,
          ['Go on duty', 'Accept a nearby offer', 'Deliver with a secure code'],
          'Open rider dashboard'
        ),
    };
    return Scaffold(
        body: SafeArea(
            child: Center(
                child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 520),
      child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              const KBrandMark(height: 42),
              const Spacer(),
              Flexible(
                  child: Text(widget.appName,
                      textAlign: TextAlign.end, style: theme.labelMedium))
            ]),
            const SizedBox(height: 24),
            Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                    color: k.brandSoft,
                    borderRadius: BorderRadius.circular(28)),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                              color: k.surface,
                              borderRadius: BorderRadius.circular(20)),
                          child: Icon(icon, color: k.brand, size: 38)),
                      const SizedBox(height: 20),
                      Text(headline,
                          style: theme.headlineMedium
                              ?.copyWith(height: 1.1, color: k.ink)),
                      const SizedBox(height: 12),
                      Text(subtitle,
                          style: theme.bodyMedium?.copyWith(color: k.inkMuted)),
                    ])),
            const SizedBox(height: 20),
            for (var i = 0; i < steps.length; i++)
              Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Row(children: [
                    Container(
                        width: 26,
                        height: 26,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                            color: k.surfaceAlt, shape: BoxShape.circle),
                        child: Text('${i + 1}', style: theme.labelMedium)),
                    const SizedBox(width: 12),
                    Expanded(child: Text(steps[i], style: theme.bodySmall)),
                  ])),
            const SizedBox(height: 8),
            ValueListenableBuilder<ClerkIdentity>(
                valueListenable: client.identity,
                builder: (context, state, _) => Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (state.signedIn) ...[
                            Text(
                                state.email == null
                                    ? 'Your account is signed in'
                                    : 'Signed in as ${state.email}',
                                key: const ValueKey('clerk-session-state'),
                                style: theme.bodySmall),
                            const SizedBox(height: 12),
                          ],
                          FilledButton(
                              onPressed: busy
                                  ? null
                                  : state.signedIn && widget.onContinue != null
                                      ? () => _run(widget.onContinue!)
                                      : () => _authenticate('signInOrUp'),
                              child: Padding(
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 4),
                                  child: Text(busy
                                      ? 'Please wait…'
                                      : state.signedIn
                                          ? continueLabel
                                          : 'Get started'))),
                          if (!state.signedIn) ...[
                            TextButton(
                                onPressed:
                                    busy ? null : () => _authenticate('signIn'),
                                child: const Text(
                                    'Sign in or recover your account')),
                            TextButton(
                                onPressed:
                                    busy ? null : () => _authenticate('signUp'),
                                child: const Text('Create an account')),
                          ],
                          if (state.signedIn && widget.onApply != null)
                            OutlinedButton(
                                onPressed: busy ? null : widget.onApply,
                                child:
                                    const Text('Apply for partner approval')),
                          if (state.signedIn)
                            TextButton(
                                onPressed: busy
                                    ? null
                                    : () => _run(() async {
                                          final revoked =
                                              await client.signOut();
                                          if (mounted) {
                                            setState(() => message = revoked
                                                ? 'Signed out.'
                                                : 'Signed out on this phone. Remote sign-out could not be confirmed; check your Clerk account sessions when online.');
                                          }
                                        }),
                                child: const Text('Sign out / change account')),
                        ])),
            if (widget.role != ClerkEntryRole.customer)
              Text(
                  'Partner access starts after Grozo approval. Signing up does not approve a store or rider.',
                  textAlign: TextAlign.center,
                  style: theme.bodySmall),
            if (widget.preview) ...[
              const SizedBox(height: 12),
              const Text(
                  'Authentication preview: a staging backend is not configured. Shopping, store operations and deliveries are unavailable.'),
            ],
            if (message != null || widget.accessError != null)
              Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Semantics(
                      liveRegion: true,
                      child: Text(message ?? widget.accessError!,
                          key: const ValueKey('clerk-access-error'),
                          style: theme.bodySmall))),
            const SizedBox(height: 12),
            Text('Secure sign-in with Clerk',
                textAlign: TextAlign.center,
                style: theme.labelSmall?.copyWith(color: k.inkMuted)),
          ])),
    ))));
  }
}
