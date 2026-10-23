# Paid sales missing from administration totals

## Diagnosis

Read-only inspection of the authorized wifome database found a real R$25.00 order, reference `ed346371`, accepted by the establishment with Asaas state `received`. Its charge was also visible as paid in the admin payment list, but the Financeiro gross KPI showed zero.

The dashboard summed only delivered orders. Financeiro summed only the payout ledger, which is deliberately created on delivery. A payment received before delivery therefore disappeared from both sales totals despite being correctly recorded.

## Correction

- Dashboard revenue, average ticket and store ranking share a confirmed-sale predicate: an online Asaas payment must be confirmed/received; offline orders count on delivery. Cancelled/refunded orders, disputed or unpaid online payments and test orders are excluded.
- Financeiro shows confirmed gross sales from orders, including payments received before delivery. It explicitly distinguishes these sales from commissions and merchant payouts generated after delivery.
- Shared order reads paginate past the Data API row cap and throw on any page failure. The dashboard displays a retryable error rather than replacing an inaccessible financial report with zeros.
- Financeiro refreshes on order changes and polls every 30 seconds as fallback. Existing dashboard refresh remains in place.
- The full current calendar month is queried even when it exceeds the trailing 30-day window.

No order, payment, ledger, wallet or settlement record was changed. No new charge, refund or withdrawal was initiated. Existing payout confirmation rules remain in force.

## Verification

The original delivered-only predicate failed the regression for the real accepted/received order; the corrected predicate passed. Read-only production data evaluated through the shared calculation returned one confirmed sale, gross 2500 cents, including 2500 cents awaiting delivery.

The full suite passed 648 tests before the additional later-page-error regression. TypeScript, scoped ESLint and the Vercel production build passed. Independent review found no critical or important defects. The additional pagination failure case verifies that partially loaded data cannot escape as a complete report.

Production UI validation should confirm the same gross amount in both Dashboard and Financeiro using the existing authenticated admin session, without simulating a financial transaction.
