import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'clerk_sessions.dart';
import '../widgets/brand.dart';

/// Business authorization happens only after [onContinue] checks the backend.
class ClerkEntryScreen extends StatefulWidget {
  const ClerkEntryScreen(
      {super.key,
      required this.appName,
      this.onContinue,
      this.onApply,
      this.preview = false,
      this.client});
  final String appName;
  final Future<void> Function()? onContinue;
  final VoidCallback? onApply;
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
      if (mounted)
        setState(() => message =
            'Secure sign-in could not connect. Check your internet and retry.');
    }
  }

  Future<void> _run(Future<void> Function() work) async {
    if (busy) return;
    setState(() {
      busy = true;
      message = null;
    });
    try {
      await work();
    } on PlatformException catch (error) {
      if (mounted)
        setState(
            () => message = error.message ?? 'Secure sign-in is unavailable.');
    } catch (_) {
      if (mounted)
        setState(() => message =
            'Grozo could not verify access. Check the connection and your account permissions, then retry.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _authenticate(String mode) => _run(() async {
        if (await client.authenticate(mode: mode))
          await widget.onContinue?.call();
      });
  @override
  Widget build(BuildContext context) => Scaffold(
          body: SafeArea(
              child: Center(
                  child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.all(28),
            children: [
              const KBrandMark(height: 72),
              const SizedBox(height: 16),
              Text(widget.appName,
                  style: Theme.of(context).textTheme.headlineLarge),
              const SizedBox(height: 16),
              Text(
                  widget.preview
                      ? 'Clerk test authentication preview'
                      : 'Secure Grozo account',
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              Text(widget.preview
                  ? 'Test sign-in on this phone. A staging backend is not configured, so shopping, store operations and deliveries are unavailable in this preview.'
                  : 'Sign in or create an account. Store and delivery access require separate Grozo approval.'),
              if (widget.preview)
                const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                        'Clerk: development instance • Backend: unconfigured • Test signing • Firebase push: unconfigured')),
              if (widget.preview)
                const Text(
                    'Rotate the exposed Clerk secret before testing. Use only synthetic test accounts.'),
              const SizedBox(height: 24),
              ValueListenableBuilder<ClerkIdentity>(
                  valueListenable: client.identity,
                  builder: (context, state, _) => Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                                state.signedIn
                                    ? 'Signed in with Clerk${state.email == null ? '' : ': ${state.email}'}'
                                    : 'Not signed in',
                                key: const ValueKey('clerk-session-state')),
                            const SizedBox(height: 16),
                            FilledButton(
                                onPressed: busy
                                    ? null
                                    : () => _authenticate('signInOrUp'),
                                child: Text(busy
                                    ? 'Please wait…'
                                    : 'Continue with Clerk')),
                            TextButton(
                                onPressed:
                                    busy ? null : () => _authenticate('signUp'),
                                child: const Text('Create an account')),
                            TextButton(
                                onPressed:
                                    busy ? null : () => _authenticate('signIn'),
                                child:
                                    const Text('Sign in or recover password')),
                            if (state.signedIn && widget.onContinue != null)
                              OutlinedButton(
                                  onPressed: busy
                                      ? null
                                      : () => _run(widget.onContinue!),
                                  child: const Text('Verify Grozo access')),
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
                                            if (mounted)
                                              setState(() => message = revoked
                                                  ? 'Signed out.'
                                                  : 'Signed out on this phone. Remote sign-out could not be confirmed; check your Clerk account sessions when online.');
                                          }),
                                  child:
                                      const Text('Sign out / change account')),
                          ])),
              if (message != null)
                Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: Text(message!)),
            ]),
      ))));
}
