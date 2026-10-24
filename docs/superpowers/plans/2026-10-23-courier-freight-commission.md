# Courier freight commission implementation plan

**Goal:** Apply the user's confirmed rule: platform keeps the existing product commission (currently 8%) and 8% of freight; courier receives 92% of freight.

**Architecture:** Extend the existing immutable order financial snapshot and delivery amount normalizer. Preserve all existing orders with zero new freight commission. Store the new rate in admin settings, snapshot rate/cents on new orders, normalize delivery offers to net payout, and carry the freight commission into the delivered ledger. No new payment provider or settlement flow.

**Tech stack:** Existing TanStack Start, Supabase/PostgreSQL and Vercel.

**Constraints:** The customer quote/total, merchant coupon funding and product commission basis remain unchanged. One server-side rounding in integer cents; net plus fee equals gross freight. Pickup/free freight yields zero. Existing orders, deliveries and ledgers are not repriced. Wallets still require manual receipt confirmation. Synthetic hosted verification rolls back and never creates real charges or transfers.

## Tasks

- [x] Add SQL regressions for new/legacy orders, immutable fee snapshots, rounding, rate changes, dispatch/retry, ledger totals/reversal and pickup/free freight. Expanded coverage includes cancelled redispatch, merchant-funded coupon conservation and direct simulator rides.
- [x] Implement migration `20261024003756_courier_freight_commission.sql`: settings column with bounded rate; protected order snapshot; delivery net normalization; ledger fee column; simulation preview adjustment. Preserve admin-only RLS for settings.
- [x] Update generated types, admin settings/save, admin finance fee breakdown and simulator distribution. Courier offers already say “Você recebe” and all courier views already use the delivery payout; they now consume the normalized net amount without a second client-side deduction.
- [x] Run SQL/UI regressions, full suite (659 tests before two added coverage cases), TypeScript, ESLint and production build; independent review found no blocking issues. Expanded targeted SQL run: six tests passed.
- [x] Apply only to authorized wifome and verify hosted rollback and advisors. Both settings are 8%; seven existing orders retain their financial values. Temporary fixtures were rolled back. No new advisor findings for the new private functions or columns.
- [ ] Publish through existing Git integration and inspect production configuration and financial UI.

## Review focus

- Online payment retries and existing orders cannot acquire a new fee after creation.
- Dispatch cannot choose a different payout from the confirmed order snapshot.
- Fee is retained once, with no extra customer charge and no premature wallet release.
- Reversed ledger rows remain excluded; test orders create no real financial ledger.
