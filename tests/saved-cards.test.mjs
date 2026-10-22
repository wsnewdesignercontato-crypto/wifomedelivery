import test from "node:test";
import assert from "node:assert/strict";
import { createPaymentService } from "../src/lib/asaas-payment-service.server.ts";
import { createAsaasPayment } from "../src/lib/asaas-payment-api.server.ts";
const payer = {
  name: "Fixture",
  cpfCnpj: "24971563792",
  email: "fixture@example.invalid",
  phone: "47999999999",
  postalCode: "89223005",
  addressNumber: "277",
};
const card = {
  holderName: "Fixture",
  number: "4111111111111111",
  expiryMonth: "12",
  expiryYear: "2035",
  ccv: "123",
};
const savedId = "c512efca-b344-4b05-955c-d65ce5defc51";
const token = "76496073-536f-4835-80db-c45d00f33695";
function fixture() {
  const seen = { posts: [], saves: [] };
  const snapshot = {
    id: "pay_fixture",
    customerId: "cus_fixture",
    externalReference: "ref",
    billingType: "CREDIT_CARD",
    valueCents: 1000,
    netValueCents: 970,
    refundedValueCents: 0,
    status: "CONFIRMED",
    cardToken: { token, brand: "VISA", last4: "1111" },
  };
  const attempt = {
    attemptId: "attempt",
    orderId: "order",
    userId: "user",
    environment: "production",
    revision: "rev",
    externalReference: "ref",
    operationId: "op",
    customerId: "cus_fixture",
    paymentId: null,
    billingType: "CREDIT_CARD",
    valueCents: 1000,
    state: "creating",
    expiresAt: "2030-01-01",
    mode: "create",
  };
  const view = {
    orderId: "order",
    channel: "asaas",
    state: "confirmed",
    totalCents: 1000,
    pix: null,
    canRetry: false,
  };
  const store = {
    claim: async () => attempt,
    credentials: async () => ({ environment: "production", revision: "rev", apiKey: "fixture" }),
    customerClaim: async () => ({ customerId: "cus_fixture" }),
    customerComplete: async () => true,
    attach: async (a, o, s) => {
      seen.attached = s;
      return true;
    },
    apply: async (a, s) => {
      seen.applied = s;
      return view;
    },
    view: async () => view,
    fail: async () => true,
    pixSave: async () => {},
    cancelRequest: async () => view,
    savedCardGet: async (...args) => {
      seen.get = args;
      return { token };
    },
    savedCardSave: async (...args) => {
      seen.saves.push(args);
      return savedId;
    },
  };
  const api = {
    createAsaasPayment: async (...args) => {
      seen.posts.push(args);
      return snapshot;
    },
    getAsaasPayment: async () => snapshot,
    findAsaasPayments: async () => [],
    getAsaasPix: async () => {},
    cancelAsaasPayment: async () => {},
    findOrCreateAsaasCustomer: async () => "cus_fixture",
  };
  return {
    store,
    api,
    seen,
    snapshot,
    attempt,
    run: (input, options = {}) =>
      createPaymentService(store, api).runPaymentAttempt(
        "user",
        "order",
        payer,
        input,
        { https: true, remoteIp: "192.0.2.1" },
        false,
        options,
      ),
  };
}
test("saved card belongs to the authenticated customer and charges only the resolved token", async () => {
  const f = fixture();
  await f.run(undefined, { savedCardId: savedId });
  assert.deepEqual(f.seen.get, ["user", "production", "rev", savedId, "cus_fixture"]);
  assert.equal(f.seen.posts.length, 1);
  assert.equal(f.seen.posts[0][6], token);
  assert.equal(f.seen.posts[0][3], undefined);
});
test("foreign, removed or stale saved cards never send a payment request", async () => {
  const f = fixture();
  f.store.savedCardGet = async () => null;
  await f.run(undefined, { savedCardId: savedId });
  assert.equal(f.seen.posts.length, 0);
});
test("saving is explicit and secrets never enter normal snapshots or returned views", async () => {
  for (const saveCard of [false, true]) {
    const f = fixture();
    const result = await f.run(card, { saveCard });
    assert.equal(f.seen.saves.length, saveCard ? 1 : 0);
    assert.ok(!JSON.stringify(f.seen.attached).includes(token));
    assert.ok(!JSON.stringify(f.seen.applied).includes(token));
    assert.ok(!JSON.stringify(result).includes(token));
    if (saveCard) assert.equal(result.cardSaveStatus, "saved");
  }
});
test("storage failure never changes a confirmed payment into a failed or duplicate charge", async () => {
  const f = fixture();
  f.store.savedCardSave = async () => {
    throw Error("unavailable");
  };
  const view = await f.run(card, { saveCard: true });
  assert.equal(view.state, "confirmed");
  assert.equal(view.cardSaveStatus, "unavailable");
  assert.equal(f.seen.posts.length, 1);
});
test("unavailable provider token and unapproved cards are not reported as saved", async () => {
  const f = fixture();
  delete f.snapshot.cardToken;
  assert.equal((await f.run(card, { saveCard: true })).cardSaveStatus, "unavailable");
  assert.equal(f.seen.saves.length, 0);
  const g = fixture();
  g.snapshot.status = "AWAITING_RISK_ANALYSIS";
  await g.run(card, { saveCard: true });
  assert.equal(g.seen.saves.length, 0);
});
test("ambiguous new and saved card input is rejected before claiming or charging", async () => {
  const f = fixture();
  let claimed = false;
  f.store.claim = async () => {
    claimed = true;
    return f.attempt;
  };
  await assert.rejects(f.run(card, { savedCardId: savedId }));
  assert.equal(claimed, false);
  assert.equal(f.seen.posts.length, 0);
});
test("token charge sends no PAN, holder info or CVV; returned token metadata is safely bounded", async () => {
  let body;
  const result = await createAsaasPayment(
    { environment: "sandbox", apiKey: "fixture" },
    {
      customerId: "cus_fixture",
      externalReference: "ref",
      billingType: "CREDIT_CARD",
      valueCents: 1000,
    },
    payer,
    undefined,
    "192.0.2.1",
    {
      fetch: async (url, init) => {
        body = JSON.parse(init.body);
        return Response.json({
          id: "pay_fixture",
          customer: "cus_fixture",
          externalReference: "ref",
          billingType: "CREDIT_CARD",
          value: 10,
          status: "CONFIRMED",
          creditCard: { creditCardToken: token, creditCardBrand: "VISA", creditCardNumber: "1111" },
        });
      },
    },
    token,
  );
  assert.equal(body.creditCardToken, token);
  assert.equal(body.creditCard, undefined);
  assert.equal(body.creditCardHolderInfo, undefined);
  assert.deepEqual(result.cardToken, { token, brand: "VISA", last4: "1111" });
});
