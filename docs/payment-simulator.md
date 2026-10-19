# Administrative payment simulator

Open Admin → Configurações → Pagamentos · modo de teste. The setting starts OFF and is separate from gateway credentials. Only administrators can read or operate the simulator.

1. Enable the simulator. Choose a customer account, approved store, amount and delivery/pickup.
2. For delivery, choose an approved online courier serving the store city and a test street address.
3. Generate a pending simulated sale, then approve or decline it. Approval creates a clearly labelled test order in the normal operational flow; refusal creates no order. The merchant and selected courier can exercise acceptance, preparation, dispatch and proof of delivery in their own apps. Normal sounds/push and the 60-second merchant deadline apply.
4. Simulate a full refund if desired. It changes only the simulated sale/order.
5. Clean test sales using the confirmation dialog. Cleanup includes linked orders, deliveries, messages, histories, notifications and non-cascading support/tracking records. It releases a courier occupied by a removed test only when no other active delivery remains. User accounts, products, carts, stock, coupons, real sales, real balances and administrative audit records remain.
6. Turn the simulator off to prevent new tests. Already-created test orders retain their test identity; cleanup remains available.

Only sales generated in this panel are simulated. The customer checkout is never globally converted into free/test purchases. No gateway is called, no real receipt can be confirmed for a test order, and no test delivery generates a ledger credit or score/review/ranking reward. Operational dashboards and financial aggregates exclude test sales. The displayed split is simulated, not a withdrawable balance.

This simulator validates the internal order/notification/delivery flow. It does not validate Asaas authentication, webhooks, real Pix/card settlement or a bank deposit. The separately updated Asaas connection and webhook panel is preserved beside the simulator. Its credentials and provider environment remain independent; the internal simulator never calls that gateway. Online checkout charges and settlement still require their own integration and validation.

Tests: `tests/payment-simulator.test.mjs` exercises the actual PostgreSQL migration with PGlite. The full-schema contract in `supabase/tests/payment-simulator.sql` uses the temporary fixture prefix from `order-acceptance-flow.sql`, inside a transaction ending in ROLLBACK. It verifies roles, mode gating, retry idempotency, immutable test identity, targeted notifications, exclusive courier access, proof completion, receipt isolation, refund and active-delivery cleanup while preserving a normal control order and inventory. All production verification fixtures are rolled back; the published simulator remains disabled.
