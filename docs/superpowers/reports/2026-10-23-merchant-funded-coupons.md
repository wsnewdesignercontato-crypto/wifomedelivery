# Merchant-funded coupon campaigns

The user corrected the previous funding rule on 2026-10-23: the admin publishes coupons for all stores, each store chooses whether to participate, and the participating store funds the discount. Percentage presets are 10%, 15% and 20%, with a custom percentage option. Product promotions and shipping remain store-managed.

## Implemented

- Admin-only publishing and pausing, global availability, terms and current-revision participation counts.
- Merchant campaign list with explicit financial acceptance and opt-out. No merchant coupon creation or term editing.
- Merchant sidebar includes the Cupons entry so the campaign panel is accessible from the store menu.
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
- Hosted rollback contract passed on wifome after session renewal and retained no synthetic data.
- Hosted checks confirmed participation RLS, no anonymous membership reads or direct authenticated inserts, and invoker public wrappers.
- Supabase security and performance advisors returned no findings mentioning the new participation table, campaign revision or campaign RPCs. Other existing project findings remain outside this release.
- Production admin and merchant panels loaded authenticated data. Admin percentage presets and merchant cost disclosure were checked without publishing or accepting a campaign. Merchant mobile layout had no horizontal overflow at a 390px viewport.
- Campaign bundles and scoped customer offer RPC references were verified across all three production origins.
- Final sidebar addition passed TypeScript, scoped ESLint and a fresh Vercel production build.

## Release status

Migration `20261023051059` applied and recorded on the authorized wifome project (`nsvgfagjezdduatmbsqq`), with source SHA-256 `d0c786c1bbb79db56ab61d18bc4a9d46c69d4ea49dde9484e7e37688459e9706`. Hosted rollback and security contracts passed on 2026-10-23 at 11:54 UTC.

Application commit `ecde4b9` was pushed to main and its Vercel deployment completed successfully. The final navigation follow-up is included with this report. Public panels are `/admin/cupons` on the customer origin and `/estabelecimento/cupons` on the store origin.

No live coupon, merchant consent, cart, order or charge was created or modified during verification. Local payment tests use synthetic credentials and make no provider requests. Parallel hosted transaction races and real provider charges were not exercised.
