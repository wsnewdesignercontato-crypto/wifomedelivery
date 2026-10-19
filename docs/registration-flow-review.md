# Registration persistence review — 2026-10-19

Scope: customer account/contact/address, establishment registration and settings, and courier personal/contact/CNH/documents/vehicle/payment registration. This review does not certify every feature of the platform or physical Android/iOS behavior.

## Confirmed issues corrected

- Establishment query errors previously rendered the create-store screen. Errors now show retry and explain that the existing registration was not deleted.
- Customer profile saves and establishment settings previously submitted every field from an old form snapshot. They now submit only edited fields. Readable changed fields also use the form's original values as update conditions, preventing an older form from overwriting a different saved value. Private establishment fields retain their restricted SELECT grants; only edited private fields are written.
- Profile/address reads ignore responses after unmount/account changes and display loading failures. Save failures retain the current draft; pending operations disable editing and repeated saves.
- Address deletion confirms the deleted row before changing the UI and refreshes the shared account/checkout data.
- Default-address selection now uses the invoker RPC `set_my_default_address`, with ownership RLS and one transaction. An injected failure on the second update preserves the original default. Anonymous calls and another account's address are rejected.
- Store creation places the confirmed store in the query cache before optional category preparation, so a category failure cannot present the store as unregistered. Decimal commas are parsed correctly and invalid fees/preparation times are rejected.
- Courier persistence protections from commits 714dc8b and 0e1b535 remain in place, including atomic phone/CNH save, guarded drafts, checked document/vehicle writes and retry safety.

## Verification

Real route-handler tests cover customer/store failures, partial updates, repeated taps, background refresh and decimal validation. Existing courier form/SQL tests cover phone/CNH persistence and reopening. Auth registration/email-confirmation regression tests remain in the full suite; no real verification emails or password changes were triggered.

The full production-schema contract in `supabase/tests/registration-persistence.sql` was executed with ordinary customer/owner claims, alongside `courier-registration.sql`. Temporary users, addresses, banking placeholders and test triggers were enclosed in BEGIN/ROLLBACK. No real customer records were changed. Security advisors showed no new findings. The address RPC retains SECURITY INVOKER, empty search_path and authenticated-only execution.

To repeat the production-schema registration contract safely: prepend the fixture prefix of `order-acceptance-flow.sql` before its first `SET LOCAL ROLE authenticated;`, append `registration-persistence.sql`, then append `ROLLBACK;`. Do not run it without the rollback wrapper.

Physical device follow-up: reopen each updated installed app, save its own registration, leave/reopen the page and confirm it no longer requests already saved required fields. Browser authentication may require email confirmation before any profile editing.

Automated regression result for this revision: 417 tests passed, zero failed. ESLint reported zero errors and four pre-existing warnings outside the changed registration pages. Production-schema registration and courier contracts also passed separately with rollback.
