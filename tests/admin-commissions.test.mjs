import test from "node:test";
import assert from "node:assert/strict";
import { commissionAmounts, summarizeCommissions } from "../src/lib/admin-commissions.ts";
const order = {
  id: "new",
  status: "accepted",
  is_test: false,
  payment_channel: "asaas",
  online_payment_state: "received",
  subtotal_cents: 10000,
  frete_cents: 1000,
  desconto_cents: 0,
  total_cents: 11000,
  commission_cents: 800,
  courier_commission_cents: 80,
  coupon_funder: "merchant",
  tipo_entrega: "delivery",
};
test("each paid sale exposes product and freight commission before delivery without a ledger", () => {
  assert.deepEqual(commissionAmounts(order), {
    products: 800,
    freight: 80,
    platform: 880,
    merchant: 9200,
    courier: 920,
    productRate: 8,
  });
  assert.deepEqual(summarizeCommissions([order]), {
    products: 800,
    freight: 80,
    platform: 880,
    unknown: 0,
  });
});
test("historical commission is shown as saved and never recalculated with the new eight percent rate", () => {
  const old = {
    ...order,
    subtotal_cents: 2000,
    frete_cents: 800,
    desconto_cents: 300,
    total_cents: 2500,
    commission_cents: 300,
    courier_commission_cents: 0,
  };
  assert.deepEqual(commissionAmounts(old), {
    products: 300,
    freight: 0,
    platform: 300,
    merchant: 1400,
    courier: 800,
    productRate: 15,
  });
});
test("coupon funding is accounted for without treating gross commission as platform net", () => {
  const merchant = commissionAmounts({ ...order, desconto_cents: 1500, total_cents: 9500 });
  assert.equal(merchant.merchant, 7700);
  assert.equal(merchant.platform, 880);
  const platform = commissionAmounts({
    ...order,
    desconto_cents: 1500,
    total_cents: 9500,
    coupon_funder: "platform",
  });
  assert.equal(platform.platform, -620);
  assert.equal(platform.merchant + platform.courier + platform.platform, 9500);
});
test("cancelled and disputed orders are excluded; absent snapshots are flagged for review", () => {
  assert.deepEqual(
    summarizeCommissions([
      { ...order, status: "cancelled" },
      { ...order, online_payment_state: "disputed" },
    ]),
    { products: 0, freight: 0, platform: 0, unknown: 0 },
  );
  assert.equal(commissionAmounts({ ...order, commission_cents: null }), null);
  assert.equal(summarizeCommissions([{ ...order, commission_cents: null }]).unknown, 1);
});
