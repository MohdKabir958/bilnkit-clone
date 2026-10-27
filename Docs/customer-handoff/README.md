# Customer Clerk-to-shopping handoff fix

The provided screenshot proves native Clerk sign-in completed, but does not identify the backend HTTP result. No personal account was accessed, tested, signed in, modified or demoted. All tests use synthetic native/HTTP fixtures.

## Confirmed source defect

Customer SessionProvider.restore rejected any non-STUDENT business role (including ADMIN) by silently ending the Grozo app session. Clerk remained signed in, so the same signed-in welcome page reappeared with no explanation. A backend 401/403/404 or absent SDK token could produce a similar loop. Clerk authentication alone does not grant customer business access. Backend/native errors cannot be diagnosed from the screenshot alone; an administrator role is a possible cause, not a verified account lookup.

## Implemented correction

- Preserve the existing Grozo theme and show an accessible, specific explanation for a non-customer role, rejected profile or missing native session token. Existing customer/partner/admin access restrictions remain unchanged; no account role is altered.
- Initialize the native Clerk identity before starting profile restoration, then let the existing AuthGate route valid customer profiles to shopping or incomplete profiles to setup.
- Use a single native token for the profile request. Ignore outdated profile responses after another restore, logout/expiry or native account switch; an old 401 cannot expire a newer successful session.
- Keep backend/network/429/5xx trouble retryable without granting access. Clear the previous access error only when a new check starts or succeeds.
- Customer version 1.16.2+26; other apps' versions are unchanged.

## Verification

Customer Flutter analysis passed locally with no issues. Local Flutter tester compilation prerequisites were checked, but actual runtime was blocked by its local socket restriction. The narrowly requested test-process escalation could not be reviewed because of an approval usage limit; it was not executed or bypassed. Existing authorized GitHub CI runs the dedicated Clerk-mode suite explicitly, the full customer suite/analysis/bundle and the shared authentication UI tests. CI results will be recorded here before a passing claim.

Dedicated command from apps/customer_app:

```sh
flutter test --no-pub --dart-define=AUTH_MODE=clerk-test test/clerk/customer_handoff.dart --reporter=expanded
```

The dedicated file is explicitly named in CI because it requires Clerk compile-time configuration; the ordinary complete Flutter tests also run unchanged with their existing configuration. This is not hosted Clerk authentication or a physical-device test. The prohibited personal account is never an input.

If the new app reports an administrator/store/delivery account, use a separate customer account. Do not demote or overwrite a business identity simply to make shopping work. If it reports rejected authentication, the deployed backend/Clerk configuration and precise non-secret error code must be checked separately, without copying bearer tokens.
