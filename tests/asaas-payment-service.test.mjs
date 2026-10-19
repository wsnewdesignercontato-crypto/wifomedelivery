import test from "node:test";
import assert from "node:assert/strict";
const mod = await import("../src/lib/asaas-payment-service.server.ts").catch(() => null);
const payer = {
  name: "Fixture Person",
  cpfCnpj: "24971563792",
  email: "fixture@example.invalid",
  phone: "47999999999",
  postalCode: "89223005",
  addressNumber: "277",
};
const card = {
  holderName: "Fixture Person",
  number: "4111111111111111",
  expiryMonth: "12",
  expiryYear: "2035",
  ccv: "123",
};
function fixture() {
  let lease = false;
  let count = 0;
  let mode = "create";
  let row = {
    orderId: "order",
    channel: "asaas",
    state: "creating",
    totalCents: 1000,
    expiresAt: "2030-01-01",
    paidAt: null,
    pix: null,
    canRetry: false,
    message: "",
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
  const snapshot = {
    id: "pay_fixture",
    customerId: "cus_fixture",
    externalReference: "ref",
    billingType: "CREDIT_CARD",
    valueCents: 1000,
    netValueCents: 970,
    refundedValueCents: 0,
    status: "CONFIRMED",
  };
  const store = {
    claim: async () => {
      const a = { ...attempt, mode: lease ? "reuse" : mode };
      lease = true;
      return a;
    },
    credentials: async () => ({ environment: "production", revision: "rev", apiKey: "fixture" }),
    customerClaim: async () => ({
      customerId: "cus_fixture",
      operationId: null,
      externalReference: "user-ref",
    }),
    customerComplete: async () => true,
    attach: async () => true,
    apply: async (_a, s) => {
      row = { ...row, state: s.status === "CONFIRMED" ? "confirmed" : "pending" };
      return row;
    },
    view: async () => row,
    fail: async (_a, _o, kind) => {
      mode = "reconcile";
      row.state = kind;
      return true;
    },
    pixSave: async () => true,
    cancelRequest: async () => {
      row.state = "cancel_pending";
      return row;
    },
  };
  const api = {
    createAsaasPayment: async () => {
      count++;
      return snapshot;
    },
    getAsaasPayment: async () => snapshot,
    findAsaasPayments: async () => [],
    getAsaasPix: async () => ({
      encodedImage: "YWJj",
      payload: "000201fixture",
      expirationDate: "2030-01-01",
    }),
    cancelAsaasPayment: async () => {},
    findOrCreateAsaasCustomer: async () => "cus_fixture",
  };
  return {
    store,
    api,
    attempt,
    snapshot,
    get count() {
      return count;
    },
    service: () => {
      assert.ok(mod, "payment service exists");
      return mod.createPaymentService(store, api);
    },
  };
}
test("concurrent tabs send one card POST and return only a safe payment view", async () => {
  const f = fixture();
  let finish;
  let entered;
  const started = new Promise((r) => (entered = r));
  f.api.createAsaasPayment = async () => {
    f.api.posts = (f.api.posts ?? 0) + 1;
    entered();
    await new Promise((r) => (finish = r));
    return f.snapshot;
  };
  const service = f.service();
  const first = service.runPaymentAttempt("user", "order", payer, card, {
    https: true,
    remoteIp: "192.0.2.1",
  });
  await started;
  const second = await service.runPaymentAttempt("user", "order", payer, card, {
    https: true,
    remoteIp: "192.0.2.1",
  });
  assert.equal(second.state, "creating");
  finish();
  assert.equal((await first).state, "confirmed");
  assert.equal(f.api.posts, 1);
  assert.ok(!JSON.stringify(second).includes(card.number));
});
test("timeout remains uncertain and explicit retry only reconciles without another POST", async () => {
  const f = fixture();
  let posts = 0;
  f.api.createAsaasPayment = async () => {
    posts++;
    throw Error("private " + card.number);
  };
  const service = f.service();
  assert.equal(
    (
      await service.runPaymentAttempt("user", "order", payer, card, {
        https: true,
        remoteIp: "192.0.2.1",
      })
    ).state,
    "uncertain",
  );
  assert.equal(
    (
      await service.runPaymentAttempt(
        "user",
        "order",
        payer,
        card,
        { https: true, remoteIp: "192.0.2.1" },
        true,
      )
    ).state,
    "uncertain",
  );
  assert.equal(posts, 1);
});
test("HTTP card submission and mismatched provider amount are refused before applying", async () => {
  const f = fixture();
  const service = f.service();
  await assert.rejects(
    service.runPaymentAttempt("user", "order", payer, card, {
      https: false,
      remoteIp: "192.0.2.1",
    }),
    /conexão segura/i,
  );
  assert.equal(f.count, 0);
  let applied = false;
  f.store.apply = async () => {
    applied = true;
  };
  f.snapshot.valueCents = 1;
  await assert.rejects(
    service.reconcilePayment({ ...f.attempt, paymentId: "pay_fixture" }),
    /conferir|concilia/i,
  );
  assert.equal(applied, false);
});
test("resuming a pending Pix retrieves its QR without creating a charge", async () => {
  const f = fixture();
  f.attempt.billingType = "PIX";
  f.snapshot.billingType = "PIX";
  f.snapshot.status = "PENDING";
  let cached;
  f.store.pixSave = async (_id, pix) => {
    cached = pix;
  };
  const service = f.service();
  await service.reconcilePayment({ ...f.attempt, paymentId: "pay_fixture" });
  assert.equal(cached.payload, "000201fixture");
  assert.equal(f.count, 0);
});
test("reconciliation selects the immutable credential revision of a historical attempt", async () => {
  const f = fixture();
  f.store.credentials = async (environment, revision) => {
    assert.equal(environment, "production");
    assert.equal(revision, "rev");
    return { environment, revision, apiKey: "fixture-history" };
  };
  await f.service().reconcilePayment({ ...f.attempt, paymentId: "pay_fixture" });
});
