import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMoneyCents,
  walletSummarySchema,
  checkoutQuoteReducer,
  currentCheckoutQuote,
  initialCheckoutQuote,
  sumLedgerAmounts,
  checkoutFailure,
} from "../src/lib/commerce.ts";

test("BRL form values reject partial parses, nonfinite amounts and database integer overflow", () => {
  for (const value of ["", "-5", "5oops", "1e3", "Infinity", "5,001", "1.000,00", "21474836.48"]) {
    assert.equal(parseMoneyCents(value), null, value);
  }
  assert.equal(parseMoneyCents(" 5,25 "), 525);
  assert.equal(parseMoneyCents("5.2"), 520);
  assert.equal(parseMoneyCents("21474836,47"), 2147483647);
});

const quote = { subtotal_cents: 2000, frete_cents: 500, desconto_cents: 200, total_cents: 2300 };

test("an old quote cannot enable submission after the address or cart changes", () => {
  let state = checkoutQuoteReducer(initialCheckoutQuote, {
    type: "start",
    requestId: 1,
    fingerprint: "address-A",
  });
  state = checkoutQuoteReducer(state, { type: "start", requestId: 2, fingerprint: "address-B" });
  state = checkoutQuoteReducer(state, {
    type: "success",
    requestId: 1,
    fingerprint: "address-A",
    quote,
  });
  assert.equal(currentCheckoutQuote(state, "address-A"), null);
  assert.equal(currentCheckoutQuote(state, "address-B"), null);
  state = checkoutQuoteReducer(state, {
    type: "success",
    requestId: 2,
    fingerprint: "address-B",
    quote,
  });
  assert.deepEqual(currentCheckoutQuote(state, "address-B"), quote);
  assert.equal(currentCheckoutQuote(state, "changed-cart"), null);
});

test("a quote error or price-change invalidation removes the previously accepted price", () => {
  let state = checkoutQuoteReducer(initialCheckoutQuote, {
    type: "start",
    requestId: 1,
    fingerprint: "cart",
  });
  state = checkoutQuoteReducer(state, {
    type: "success",
    requestId: 1,
    fingerprint: "cart",
    quote,
  });
  state = checkoutQuoteReducer(state, { type: "start", requestId: 2, fingerprint: "cart" });
  assert.equal(currentCheckoutQuote(state, "cart"), null);
  state = checkoutQuoteReducer(state, {
    type: "error",
    requestId: 2,
    fingerprint: "cart",
    error: "Store closed",
  });
  state = checkoutQuoteReducer(state, {
    type: "success",
    requestId: 1,
    fingerprint: "cart",
    quote,
  });
  assert.equal(currentCheckoutQuote(state, "cart"), null);
  assert.equal(state.error, "Store closed");
});

test("finance totals exclude reversed orders while preserving signed discount funding", () => {
  const row = {
    status: "paid",
    gross_cents: 1000,
    platform_revenue_cents: -100,
    merchant_payout_cents: 800,
    courier_payout_cents: 300,
  };
  assert.deepEqual(sumLedgerAmounts([row, { ...row, status: "reversed", gross_cents: 999999 }]), {
    gross: 1000,
    revenue: -100,
    merchant: 800,
    courier: 300,
  });
});

test("a rejected price refreshes the quote while an uncertain response preserves the same retry", () => {
  assert.deepEqual(
    checkoutFailure("CHECKOUT_REJECTED:CHECKOUT_QUOTE_CHANGED:Confira o novo total"),
    { message: "Confira o novo total", refreshQuote: true },
  );
  assert.deepEqual(checkoutFailure("Failed to fetch"), {
    message:
      "Não foi possível confirmar a resposta. Tente novamente para verificar a mesma tentativa.",
    refreshQuote: false,
  });
});

test("a store-funded promotion can expose a signed accounting balance without enabling a withdrawal", () => {
  const result = walletSummarySchema.parse({
    available_cents: 0,
    pending_cents: -120,
    total_cents: -120,
    reserved_cents: 0,
  });
  assert.equal(result.pending_cents, -120);
  assert.equal(result.available_cents, 0);
  assert.equal(walletSummarySchema.safeParse({ ...result, available_cents: -1 }).success, false);
});

test("invalid wallet responses cannot display spendable funds", () => {
  assert.equal(walletSummarySchema.safeParse({ available_cents: "10000" }).success, false);
  assert.equal(
    walletSummarySchema.safeParse({ available_cents: 10000, pending_cents: 0, total_cents: 10000 })
      .success,
    false,
  );
});
