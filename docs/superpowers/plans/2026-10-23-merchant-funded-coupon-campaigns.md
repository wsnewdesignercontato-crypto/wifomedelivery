# Merchant funded opt-in coupons implementation plan

> Execute in the existing isolated worktree. User explicitly corrected the earlier funding rule: admin publishes coupon campaigns for all stores; each store opts in and pays its own redemptions. Product promotions and shipping remain store managed.

**Goal:** Admin controlled coupon campaigns with explicit merchant acceptance and authoritative merchant-funded checkout.

**Architecture:** Retain coupons, checkout, online payments and ledger. Add versioned coupon participation and authenticated merchant RPCs, plus a safe customer offer directory. Snapshot campaign revision on new orders; existing orders and their funding remain unchanged.

**Scope:** A general percentage discount is expressed by the admin campaign accepted by the store. Existing per-product promotional prices remain. Only one coupon is accepted per order by the existing checkout contract.

## Tasks

- [x] Add SQL regression tests for opt-in, opt-out, cross-store access, admin-only publishing, changed terms requiring renewed acceptance, pauses/expiry/limits, quote/commit parity, merchant-funded orders and ledger, online reservations and idempotence.
- [x] Implement migration `20261023051059_merchant_opt_in_coupon_campaigns.sql` and update Supabase types. Private guarded implementations with minimal public wrappers; RLS on participation; no direct merchant coupon writes. Coupons are available only to participating stores. Enrollment and checkout lock coupon before participation.
- [x] Replace merchant coupon creation with released-campaign list and explicit acceptance/leave actions. Admin creates/releases percentage campaigns and sees current participants. Network failures preserve UI state and report errors.
- [x] Customer home and cart use `customer_coupon_offers(uuid[])` instead of guessing coupon scope. Return only current accepted offers for approved stores, no acceptance identities; codes visible only to authenticated users.
- [x] Run targeted SQL/UI tests, full suite (643 passed), typecheck, lint, production build and independent review (no important findings).
- [ ] Apply migration to authorized wifome after access renewal; verify synthetic rollback tests there, then publish and inspect production. Never change live coupons/participation to make tests pass. Current management API session returned HTTP 401; login renewal requested from user.

## Review focus

- Financial edits invalidate previous acceptance without repricing existing orders.
- Concurrent opt-out, admin pause and checkout cannot silently spend another store's budget.
- Existing payment retries return the original order after opt-out, retaining idempotence.
- A campaign published globally never implies automatic store participation.
- Store funding supersedes the previous platform-funded rule for future redemptions only.
