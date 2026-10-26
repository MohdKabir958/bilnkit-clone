# Workflow findings

Baseline: `be665d1a71b91bc32c5935ee4108740db9bc1eba`. No newer remote source was discarded. The exact request is retained in `REQUEST.md`; each task is tracked in `00_MASTER_TRACKER.md`.

| Finding | Cause/gap | Resulting correction |
| --- | --- | --- |
| Pricing edits could fail under concurrency | A global settings query acquired another connection while an interactive transaction held locks; tests ignored edit responses | Reuse the transaction client; assert successful edits, persisted prices and atomic audits; repeat with two connections |
| Online checkout could imply unavailable payment | UI choices were not authoritative provider capabilities | Server capabilities/city policy and fresh-quote guard; no invented online method from an empty/missing list |
| Checkout replacement could race a payment | Order age alone did not describe a fresh/unknown provider attempt | Durable creation intent, protected attempt/grace window, authoritative no-capture reconciliation |
| Dispatch timing did not reflect packing | Matching and preparation estimates were disconnected | Packing policies, travel-aware dispatch timing, immediate ready matching and bounded audited override |
| Serviceability was insufficient to promise fulfillment | Coverage did not account for usable rider/store capacity | Fresh approved rider/city/zone/load assessment at quote, commit and payment; bounded recovery/escalation |
| GPS recovery lacked safe exception handling | Accuracy/replay/movement and manual-proof boundaries needed enforcement | Validated measurements and independent two-admin, expiring stage-specific exception; OTP remains mandatory |
| Physical packs and financial reservations were conflated | Cancellation assumed stock was reusable | Separate packing/missing/damage/expiry/return inspection; FEFO lots; no automatic return of unusable packs |
| Item reductions needed a customer decision | Full-order cancellation could not express safe partial changes | Versioned full-basket approval, server pricing, lower COD due and receipt-bound asynchronous partial refund |
| Cash remittance needed independent evidence | Rider collection is not platform receipt | Append-only ledger, unique receipts, partial balance/dispute/daily close with second reviewer |
| Background processes could overlap or die silently | In-process execution lacked durable ownership/recovery | PostgreSQL claims, leases, heartbeats, fencing, bounded attempts and operator diagnostics |
| Support/operations tools were fragmented | Missing issue ownership, deadlines and private evidence | Categorized cases, assignment/escalation, exception queue, controlled private photos and retention |
| Readiness could accept the wrong database | Reachability alone did not verify schema/storage | Required-column/migration probes and public/private storage checks |
| Cloud failures obscured application failures | Disk 99% full, missing PATH tools, unwritable caches and adb home | Repaired environment and replayed setup; sequential checks; application failures tracked separately |
| Checkout discarded capacity estimates | The backend quote included a window that the client model dropped | Parse only bounded server windows and display a qualified estimate without changing totals |
| Public support replies lacked a durable alert | Private case notes existed without an outbox context or mobile deep link | Atomic public-reply intent, fenced per-device acknowledgments/retries, generic lock-screen copy and authorized private-thread routing in all three apps |
| Existing worker/compliance APIs were difficult to find | No admin job-health or FSSAI expiry panel; exception follow-up omitted the owner | Lazy-loaded operational monitoring with reasoned retry, expiry reminders and approved-admin issue assignment |

Earlier failed diagnostic runs are retained. The retained checkpoint has 1,233 backend tests passing in one invocation. Latest-source release results are recorded separately in 06_FULL_TEST_RESULTS.md. Fixtures remain explicitly synthetic; local results do not establish a hosted provider or physical-device result.
