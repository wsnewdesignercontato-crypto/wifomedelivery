# Merchant-funded coupon campaigns

The user corrected the previous funding rule on 2026-10-23: the admin publishes coupons for all stores, each store chooses whether to participate, and the participating store funds the discount. Percentage presets are 10%, 15% and 20%, with a custom percentage option. Product promotions and shipping remain store-managed.

## Implemented locally

- Admin-only publishing and pausing, global availability, terms and current-revision participation counts.
- Merchant campaign list with explicit financial acceptance and opt-out. No merchant coupon creation or term editing.
- Revision changes invalidate old acceptance. Changed terms cannot charge a merchant until it accepts again.
- Authoritative checkout checks current participation and stores merchant funding and campaign revision. Existing orders retain original totals and funding. Order retries remain idempotent after opt-out or term changes.
- Customer cards and cart discover only offers from stores that accepted the current campaign revision. Public discovery exposes no membership identities and omits coupon codes for guests.
- New participation table has RLS, no anonymous reads and no direct authenticated writes. Public RPC wrappers run as invoker; privileged implementations remain private and guarded.

## Validation

- Full test suite: 643 passed, zero failures.
- Additional final SQL regression run: 9 passed, including removal of legacy anonymous coupon enumeration.
- TypeScript and scoped ESLint: passed.
- Vercel production build: passed.
- Independent review: no actionable important findings; 27 targeted tests passed during review.
- Hosted rollback contract was exercised locally and retained no synthetic data.

## Release status

Not applied to the hosted database and not deployed. The authorized Supabase project is wifome (`nsvgfagjezdduatmbsqq`). Its management API session returned HTTP 401; user login renewal is pending. Apply the migration and run `supabase/tests/coupon-campaigns.sql` against that project before pushing the application changes to production.

No live coupon, merchant consent, cart, order or charge was created or modified. Local payment tests use synthetic credentials and make no provider requests. Hosted PostgREST/RLS, concurrent transactions and visual verification remain release checks.
