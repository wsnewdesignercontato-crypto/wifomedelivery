# Platform commission per sale

The financial overview previously measured platform revenue only from delivered ledger rows. A confirmed online payment on an accepted order consequently showed zero platform commission even though its immutable commission snapshot was already stored.

The admin financial screen now displays the projected platform commission for confirmed sales, its product/freight components, and a responsive per-order breakdown. Delivered ledger revenue is shown separately and payout confirmation remains unchanged. Cancelled, disputed, unpaid and test orders do not contribute to commission totals. Unknown legacy commission snapshots are marked for review rather than treated as zero.

Historical order `ed346371` has R$20.00 in products, R$8.00 freight and a R$3.00 merchant-funded coupon. Its saved product commission is R$3.00 (the earlier 15% rate), with no freight commission. The display preserves these figures; the current 8% settings apply to new orders. No order is repriced by this change.

Commission columns are not readable by the browser's ordinary database role. A server function checks current authenticated/active-account access using the existing auth middleware and checks the admin role before reading the financial snapshots with the server-only client. No column grant or database migration was added. Paginated reads reject errors on any page.

Validation: 667 tests passed, TypeScript passed, scoped ESLint passed, and the Vercel production build passed. Tests cover the legacy 15% snapshot, the new 8% plus 8% split, signed platform-funded coupon adjustments, missing snapshots, denied nonadmin access, pagination and partial-query failure. No payment, settlement, withdrawal, order or ledger record was modified.
