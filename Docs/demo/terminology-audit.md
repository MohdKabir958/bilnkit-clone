# Active terminology guard

Run `python3 scripts/qa/check_ui_terminology.py` from the repository root. It is wired into the existing backend CI job after dependency installation. Three lexer regression tests cover comment apostrophes, interpolation and multiline/raw strings.

The guard reads Dart literals with a comment/interpolation-aware lexer and TypeScript/TSX strings/template segments/JSX text with the TypeScript AST. It scans all three app libraries and the shared Flutter UI package, their current screenshot fixtures, admin source, backend source responses/notifications and the new scenario JSON. Inappropriate campus, hostel, gate, restaurant/kitchen/student/runner/dish language is rejected.

`scripts/qa/terminology-allowances.json` contains 125 exact `(file, literal)` compatibility exceptions with reasons; there is no blanket exemption for an active screen. The scan currently finds 195 allowed occurrences. Stable enum/role values, API routes/fields, icon/marker/widget keys and legacy machine-interpreted cancellation/error sentinels retain their original spelling. Their visible display text uses grocery/doorstep wording.

Inherited regression fixture directories are deliberately historical contract data, not the client demo. They preserve names, addresses and old payloads to keep backwards-compatibility tests meaningful. Current screenshot fixtures are scanned. The unreferenced inherited `backend/src/store.ts` fixture is excluded with an explicit reason; API startup does not import it. `backend/src/config/campus.ts` remains a historical coordinate lookup for already-stored orders; new checkouts/demo data use structured addresses and explicit pins. No Prisma field, route, migration identifier or status code was renamed.

Public fixes include cart instructions, tracking/code-copy text, profile delivery wording, pickup placeholders, vendor identity fallbacks, admin order/OTP tools, delivery success responses and Google sign-in configuration wording. Unfinished coins controls/promotions are separately absent from cart, checkout, profile, reviews and completion prompts. Financial balance records/API fields remain.
