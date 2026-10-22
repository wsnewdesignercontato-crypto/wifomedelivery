# Checkout, saved cards and beverage units

Status: implementation validated locally; both hosted migrations applied and verified on the correct PedeTrem project. Production publication follows the existing Git/Vercel workflow.

## Result

- Responsive customer checkout with the existing red PedeTrem artwork, server-validated subtotal, delivery, discount and total, product quantities, saved addresses and online/delivery payment choices.
- Explicit card-save consent. Provider tokens are held in Vault and bound to the authenticated customer, environment and credential revision. Browser responses contain only card ID, brand and last four digits. No PAN or CVV is persisted.
- Optional token persistence cannot invalidate or duplicate a confirmed payment. Production reuse depends on Asaas tokenization availability; a missing token produces a safe unavailable notice.
- Beverage editor accepts ml/L and decimal commas, preserves canonical millilitres and legacy attributes, and displays the selected unit in product labels and cart snapshots.

## Proven checkout failure

Read-only inspection of the current hosted cart found a store city without the accent in “Paraíso” and the saved address with the accent. `private.checkout_freight` compared lowercased text without accent normalization and rejected delivery before calculating totals.

Migration `20261022215140_normalize_checkout_delivery_locations.sql` uses exact normalized city and neighborhood equality. Different cities, radius and configured delivery areas remain restricted. Regression quotes return 3200 subtotal + 900 delivery = 4100, with no order creation.

Older carts also contain a missing mandatory addon or quantity above stock; those validations remain enforced and the UI explains how to correct them.

## Verification

- Full suite: 578 tests passed.
- TypeScript, scoped ESLint, whitespace checks and Vercel build passed.
- Independent review: no critical or important findings.
- Actual component preview checked at desktop size and 390px mobile override; no horizontal overflow. Preview uses synthetic data and does not submit charges.
- Saved-card SQL contracts passed against both local PostgreSQL/PGlite and hosted Supabase/Vault in rollback transactions. Ownership, role denial, encrypted storage, removal and account-deletion cleanup passed without leaving fixtures.
- Hosted cart diagnostic now returns 1600 subtotal + 900 delivery = 2500, and pickup = 1600, for the current cart affected by the city-accent bug. Older invalid-addon and insufficient-stock carts still reject appropriately.
- Production payment settings remain enabled, tested and registered against the current webhook revision. No real charge was submitted.
- Hosted advisors: no saved-card security warning/error. The informational no-policy notice is deliberate: this private table denies browser roles and is accessed only by service-role RPCs. The environment foreign-key index suggestion is informational; user lookup and token-secret keys are indexed.

## Release continuation

Target Supabase is only `nsvgfagjezdduatmbsqq` (WS account). The connector account lists a different project and must not be used. A native CLI project listing confirmed the correct WS project after login.

The previous ignored connection helper read a stale legacy credential. Native CLI debug output identified its effective profile as `supabase`, despite the requested alias. The helper now mirrors that verified credential lookup and retains the hard guard restricting requests to the WS project and organization. No credential was printed or added to Git.

The ignored target-guarded helper `.superpowers/sdd/2026-10-22-premium-checkout/apply-and-verify.cjs` applied the city correction first, checked saved-card contracts in a hosted rollback transaction, then applied saved-card storage and recorded migration history. The final cart diagnostic was rollback-only. No real payments, cart edits or persistent test orders have been made during this implementation.
