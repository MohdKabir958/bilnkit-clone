import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kraveo_ui/kraveo_ui.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../providers/session_provider.dart';
import '../widgets/ui/display_text.dart';
import '../widgets/ui/error_line.dart';
import '../widgets/ui/k_icon_button.dart';
import '../widgets/ui/phone_input.dart';

/// Name rule shared with the backend (`backend/src/utils/names.ts`): 2-60 characters, the first a
/// letter in any script, then letters, combining marks (Devanagari vowel signs), digits (Google
/// names such as "RAHUL SHARMA 22BCE10123"), spaces, dots, apostrophes (straight or curly) and hyphens.
const int kNameMinLength = 2;
const int kNameMaxLength = 60;

final RegExp _nameFirstChar = RegExp(r'^\p{L}', unicode: true);
final RegExp _nameChars = RegExp(r"^[\p{L}\p{M}\p{Nd} .'\u2019\-]+$", unicode: true);

/// Returns a user-facing problem with [raw], or null when it is an acceptable name.
String? validateFullName(String raw) {
  final name = raw.trim().replaceAll(RegExp(r'\s+'), ' ');
  if (name.isEmpty) return 'Tell us your name so the runner knows who to look for.';
  final length = name.runes.length; // characters, as the server counts them
  if (length < kNameMinLength) return 'Your name needs at least $kNameMinLength letters.';
  if (length > kNameMaxLength) return 'Keep your name under $kNameMaxLength characters.';
  if (!_nameFirstChar.hasMatch(name)) return 'Your name has to start with a letter.';
  if (!_nameChars.hasMatch(name)) return 'Use letters and digits only (spaces, dots, apostrophes and hyphens are fine).';
  return null;
}

/// Sign-up after the first Google sign-in: three steps in one PageView, one save at the end.
///
/// 1. Full name (pre-filled from Google) and mobile number
/// 2. "Are you a student?" (yes: hostel block, no: skipped; the drop point is asked at checkout)
/// 3. Avatar
///
/// All answers live in this State, so stepping back never loses what was typed. The final
/// "Finish" sends a single PUT /auth/profile. Nothing can be skipped; the only way out is to
/// use a different Google account.
class ProfileSetupScreen extends StatefulWidget {
  const ProfileSetupScreen({super.key});

  @override
  State<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends State<ProfileSetupScreen> {
  static const int _steps = 2;

  final PageController _pages = PageController();
  late final TextEditingController _name;
  late final TextEditingController _phone;
  final _nameFocus = FocusNode();
  final _phoneFocus = FocusNode();

  int _step = 0;
  int? _avatarId;

  String? _nameError;
  String? _phoneError;
  String? _formError;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final session = context.read<SessionProvider>();
    final user = session.user;
    _name = TextEditingController(text: session.suggestedName ?? '');
    _phone = TextEditingController(text: normalizeIndianPhone(user?.phone ?? ''));
    _avatarId = user?.avatarId;
  }

  @override
  void dispose() {
    _pages.dispose();
    _name.dispose();
    _phone.dispose();
    _nameFocus.dispose();
    _phoneFocus.dispose();
    super.dispose();
  }

  String get _cleanName => _name.text.trim().replaceAll(RegExp(r'\s+'), ' ');
  String get _phoneDigits => normalizeIndianPhone(_phone.text);


  bool get _canContinue => switch (_step) {
        0 => true, // validated with messages on tap
        _ => _avatarId != null,
      };

  void _goTo(int step) {
    FocusScope.of(context).unfocus();
    setState(() {
      _step = step;
      _formError = null;
    });
    _pages.animateToPage(step, duration: KMotion.base, curve: KMotion.emphasized);
  }

  void _back() {
    if (_saving || _step == 0) return;
    _goTo(_step - 1);
  }

  Future<void> _next() async {
    if (_saving) return;
    switch (_step) {
      case 0:
        final nameProblem = validateFullName(_name.text);
        final phoneProblem = validateIndianMobile(_phoneDigits);
        if (nameProblem != null || phoneProblem != null) {
          setState(() {
            _nameError = nameProblem;
            _phoneError = phoneProblem;
          });
          (nameProblem != null ? _nameFocus : _phoneFocus).requestFocus();
          return;
        }
        _goTo(1);
      default:
        await _submit();
    }
  }

  Future<void> _submit() async {
    final avatar = _avatarId;
    if (avatar == null) return;
    setState(() {
      _saving = true;
      _formError = null;
    });
    final session = context.read<SessionProvider>();
    final result = await session.saveProfile(
      name: _cleanName,
      phone: _phoneDigits,
      avatarId: avatar,
    );
    if (!mounted) return; // success: AuthGate swaps this screen for Home
    if (result.unauthorized) return; // AuthGate is already showing login
    if (result.success && !result.needsProfile) return;
    setState(() {
      _saving = false;
      if (result.success) {
        _formError = 'We still need a few details. Please check each step.';
        return;
      }
      final msg = result.networkError ? 'We couldn\'t reach ${BrandConfig.name}. Check your connection and try again.' : (result.message ?? 'We couldn\'t save your details. Please try again.');
      switch (result.field) {
        case 'name':
          _nameError = msg;
          _jumpTo(0);
        case 'phone':
          _phoneError = msg;
          _jumpTo(0);
        case 'isStudent' || 'hostelBlock':
          _formError = msg;
          _jumpTo(1);
        default:
          _formError = msg;
      }
    });
  }

  /// Moves to [step] after a server-side field error, without the unfocus/animate side effects
  /// of [_goTo] running inside setState.
  void _jumpTo(int step) {
    _step = step;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _pages.hasClients) _pages.animateToPage(step, duration: KMotion.base, curve: KMotion.emphasized);
    });
  }

  @override
  Widget build(BuildContext context) {
    final k = context.k;
    final email = context.select<SessionProvider, String?>((s) => s.user?.email);
    final last = _step == _steps - 1;
    return PopScope(
      // Step 1 has no earlier step: back leaves the app like anywhere else (the half-finished
      // sign-up is still here next time). Later steps go back one step; nothing while saving.
      canPop: _step == 0 && !_saving,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Scaffold(
        backgroundColor: k.bg,
        body: Stack(children: [
          Positioned(
            top: -90,
            right: -70,
            child: Container(width: 260, height: 260, decoration: BoxDecoration(color: k.brandSoft, shape: BoxShape.circle)),
          ),
          SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 460),
                child: Column(children: [
                  _Header(step: _step, total: _steps, canGoBack: _step > 0 && !_saving, onBack: _back),
                  Expanded(
                    child: PageView(
                      controller: _pages,
                      physics: const NeverScrollableScrollPhysics(),
                      children: [
                        _Page(child: _nameStep(context, email)),
                        _Page(child: _avatarStep(context)),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(KSpace.gutter, 8, KSpace.gutter, 16),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      if (_formError != null) Padding(padding: const EdgeInsets.only(bottom: 10), child: KErrorLine(message: _formError)),
                      KButton(
                        label: last ? 'Finish' : 'Continue',
                        icon: last ? LucideIcons.check : LucideIcons.arrowRight,
                        large: true,
                        loading: _saving,
                        onPressed: _canContinue ? _next : null,
                      ),
                    ]),
                  ),
                ]),
              ),
            ),
          ),
        ]),
      ),
    );
  }

  // ---- Step 1: name + phone -------------------------------------------------------------

  Widget _nameStep(BuildContext context, String? email) {
    final k = context.k;
    final session = context.read<SessionProvider>();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      KDisplayText('Welcome to\nKraveo', style: KraveoType.displayMd.copyWith(color: k.ink)),
      const SizedBox(height: 10),
      Text('Tell us who you are so your runner can find you at the gate.', style: KraveoType.body.copyWith(color: k.inkMuted)),
      const SizedBox(height: 24),
      _label(context, 'FULL NAME'),
      TextField(
        key: const ValueKey('name-field'),
        controller: _name,
        focusNode: _nameFocus,
        enabled: !_saving,
        textCapitalization: TextCapitalization.words,
        textInputAction: TextInputAction.next,
        keyboardType: TextInputType.name,
        autofillHints: const [AutofillHints.name],
        inputFormatters: [LengthLimitingTextInputFormatter(kNameMaxLength)],
        style: KraveoType.titleLg.copyWith(color: k.ink),
        onChanged: (_) {
          if (_nameError != null || _formError != null) setState(() => _nameError = _formError = null);
        },
        onSubmitted: (_) => _phoneFocus.requestFocus(),
        decoration: InputDecoration(
          hintText: 'e.g. Aarav Sharma',
          prefixIcon: Icon(LucideIcons.user, size: 20, color: k.inkMuted),
          enabledBorder: _nameError != null ? _errorBorder() : null,
        ),
      ),
      KErrorLine(message: _nameError),
      const SizedBox(height: 20),
      _label(context, 'MOBILE NUMBER'),
      TextField(
        key: const ValueKey('phone-field'),
        controller: _phone,
        focusNode: _phoneFocus,
        enabled: !_saving,
        keyboardType: TextInputType.phone,
        textInputAction: TextInputAction.done,
        autofillHints: const [AutofillHints.telephoneNumberNational],
        inputFormatters: const [IndianPhoneInputFormatter()],
        style: KraveoType.titleLg.copyWith(color: k.ink, letterSpacing: 1),
        onChanged: (_) {
          if (_phoneError != null || _formError != null) setState(() => _phoneError = _formError = null);
        },
        onSubmitted: (_) => _next(),
        decoration: InputDecoration(
          hintText: '98765 43210',
          prefixIcon: Padding(
            padding: const EdgeInsets.only(left: 18, right: 10),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Text('+91', style: KraveoType.titleLg.copyWith(color: k.inkMuted)),
              const SizedBox(width: 10),
              Container(width: 1.4, height: 24, color: k.line),
            ]),
          ),
          prefixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
          enabledBorder: _phoneError != null ? _errorBorder() : null,
        ),
      ),
      if (_phoneError == null)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text('Your runner may call this when they reach the gate.', style: KraveoType.bodySm.copyWith(color: k.inkMuted)),
        ),
      KErrorLine(message: _phoneError),
      const SizedBox(height: 20),
      if (email != null)
        Container(
          padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
          decoration: BoxDecoration(color: k.surface, borderRadius: BorderRadius.circular(KRadius.md), border: Border.all(color: k.line.withValues(alpha: 0.8))),
          child: Row(children: [
            Icon(LucideIcons.mail, size: 18, color: k.inkMuted),
            const SizedBox(width: 10),
            Expanded(child: Text(email, maxLines: 1, overflow: TextOverflow.ellipsis, style: KraveoType.bodySm.copyWith(color: k.ink, fontWeight: FontWeight.w600))),
            KPressable(
              onTap: _saving ? null : session.logout,
              semanticLabel: 'Use a different Google account',
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                child: Text('Switch', style: KraveoType.label.copyWith(color: k.brand, fontSize: 13)),
              ),
            ),
          ]),
        ),
    ]);
  }

  // ---- Step 2: student? -----------------------------------------------------------------

  Widget _avatarStep(BuildContext context) {
    final k = context.k;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      KDisplayText('Pick your\navatar', style: KraveoType.displayMd.copyWith(color: k.ink)),
      const SizedBox(height: 10),
      Text('This is how you show up in ${BrandConfig.name}. You can change it any time from the Me tab.', style: KraveoType.body.copyWith(color: k.inkMuted)),
      const SizedBox(height: 20),
      Center(child: KAvatar(id: _avatarId, size: 88, ring: _avatarId != null)),
      const SizedBox(height: 20),
      IgnorePointer(ignoring: _saving, child: KAvatarPicker(selectedId: _avatarId, onChanged: (id) => setState(() => _avatarId = id))),
      if (_avatarId == null)
        Padding(
          padding: const EdgeInsets.only(top: 14),
          child: Text('Choose one to finish.', style: KraveoType.bodySm.copyWith(color: k.inkMuted)),
        ),
    ]);
  }

  Widget _label(BuildContext context, String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text, style: KraveoType.label.copyWith(color: context.k.inkMuted)),
      );

  OutlineInputBorder _errorBorder() => OutlineInputBorder(borderRadius: KRadius.control, borderSide: const BorderSide(color: KraveoPalette.danger, width: 1.6));
}

class _Page extends StatelessWidget {
  const _Page({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(KSpace.gutter, 8, KSpace.gutter, 16),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      child: child,
    );
  }
}

/// Back button (steps 2-3) + progress dots.
class _Header extends StatelessWidget {
  const _Header({required this.step, required this.total, required this.canGoBack, required this.onBack});

  final int step;
  final int total;
  final bool canGoBack;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final k = context.k;
    return Padding(
      padding: const EdgeInsets.fromLTRB(KSpace.gutter, 12, KSpace.gutter, 8),
      child: Row(children: [
        SizedBox(
          width: 44,
          height: 44,
          child: step > 0 ? KIconButton(icon: LucideIcons.arrowLeft, semanticLabel: 'Back', onTap: canGoBack ? onBack : null) : null,
        ),
        Expanded(
          child: Semantics(
            label: 'Step ${step + 1} of $total',
            child: ExcludeSemantics(
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                for (var i = 0; i < total; i++)
                  AnimatedContainer(
                    duration: KMotion.base,
                    curve: KMotion.emphasized,
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    width: i == step ? 28 : 10,
                    height: 10,
                    decoration: BoxDecoration(color: i <= step ? k.brand : k.line, borderRadius: BorderRadius.circular(KRadius.pill)),
                  ),
              ]),
            ),
          ),
        ),
        const SizedBox(width: 44),
      ]),
    );
  }
}

/// Big selectable card (Yes / No).
