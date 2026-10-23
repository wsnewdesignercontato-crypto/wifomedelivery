import test from "node:test";
import assert from "node:assert/strict";
import { isConfirmedSale, summarizeAdminSales } from "../src/lib/admin-sales.ts";

const sale = {
  id: "paid-order",
  status: "accepted",
  total_cents: 2500,
  payment_channel: "asaas",
  online_payment_state: "received",
  is_test: false,
};
test("received Pix is a confirmed sale before delivery without needing a ledger row", () => {
  assert.equal(isConfirmedSale(sale), true);
  assert.deepEqual(summarizeAdminSales([sale]), {
    count: 1,
    gross: 2500,
    online: 2500,
    awaitingDelivery: 2500,
  });
});
test("delivery does not count a paid order twice and offline delivery remains a sale", () => {
  assert.deepEqual(
    summarizeAdminSales([
      { ...sale, status: "delivered" },
      {
        ...sale,
        id: "cash",
        status: "delivered",
        payment_channel: "delivery",
        online_payment_state: null,
        total_cents: 3900,
      },
    ]),
    { count: 2, gross: 6400, online: 2500, awaitingDelivery: 0 },
  );
  assert.equal(isConfirmedSale({ ...sale, online_payment_state: "confirmed" }), true);
});
test("unpaid, cancelled, refunded, disputed and test orders never inflate sales", () => {
  const excluded = [
    { ...sale, is_test: true },
    { ...sale, status: "cancelled" },
    { ...sale, status: "refunded" },
    ...[
      "pending",
      "creating",
      "refund_pending",
      "refunded",
      "partially_refunded",
      "disputed",
      "failed",
    ].map((state) => ({ ...sale, status: "delivered", online_payment_state: state })),
    { ...sale, payment_channel: "delivery", online_payment_state: null },
  ];
  for (const row of excluded) assert.equal(isConfirmedSale(row), false, JSON.stringify(row));
  assert.equal(summarizeAdminSales(excluded).gross, 0);
});
