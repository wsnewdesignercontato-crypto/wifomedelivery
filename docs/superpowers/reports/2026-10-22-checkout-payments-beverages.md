# Checkout, saved cards and beverage units

Status: implementation validated locally; hosted migrations and production publication pending restored Supabase administrative access.

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
- Saved-card SQL contracts run against local PostgreSQL/PGlite with Vault API emulation; hosted encryption, permissions and existing-cart quotes must still be verified on the correct project.

## Release continuation

Target Supabase is only `nsvgfagjezdduatmbsqq` (WS account). The existing administrative profile currently returns HTTP 403. Connector account lists a different project and must not be used.

After the user restores `wifomedelivery-ws` login on WILLIAN, use the ignored target-guarded helper `.superpowers/sdd/2026-10-22-premium-checkout/apply-and-verify.cjs`. It applies the city correction first, checks saved-card contracts in a hosted rollback transaction, then applies saved-card storage and records migration history. The final cart diagnostic is rollback-only and saves sanitized results privately.

Validate hosted advisors and quote results before publishing through the existing Git/Vercel workflow. No real payments, cart edits or persistent test orders have been made during this implementation.
