import test from "node:test";
import assert from "node:assert/strict";
const contract = await import("../src/lib/asaas-payment-contract.ts").catch(() => null);
const api = await import("../src/lib/asaas-payment-api.server.ts").catch(() => null);
const payer = {
  name: "Sandbox Fixture",
  cpfCnpj: "24971563792",
  email: "fixture@example.invalid",
  phone: "47999999999",
  postalCode: "89223005",
  addressNumber: "277",
};
const card = {
  holderName: "Sandbox Fixture",
  number: "4111111111111111",
  expiryMonth: "12",
  expiryYear: "2035",
  ccv: "123",
};
const credentials = { environment: "sandbox", apiKey: "fixture-key-" + "a".repeat(40) };
const attempt = {
  customerId: "cus_fixture",
  externalReference: "pedetrem:fixture:attempt",
  billingType: "CREDIT_CARD",
  valueCents: 10990,
};
const payment = {
  id: "pay_fixture",
  customer: "cus_fixture",
  externalReference: attempt.externalReference,
  billingType: "CREDIT_CARD",
  value: 109.9,
  netValue: 106.5,
  status: "CONFIRMED",
};

test("payment validators normalize only allowed fields and reject invalid payer data without echoing it", () => {
  assert.ok(contract, "payment contracts must exist");
  assert.deepEqual(
    contract.validatePayer({
      ...payer,
      apiKey: "must-not-return",
      name: " Sandbox Fixture ",
      cpfCnpj: "249.715.637-92",
    }),
    payer,
  );
  for (const change of [
    { cpfCnpj: "11111111111" },
    { cpfCnpj: "24971563790" },
    { email: "invalid" },
    { phone: "123" },
    { postalCode: "12" },
    { name: "<bad>\n" },
  ])
    assert.throws(
      () => contract.validatePayer({ ...payer, ...change }),
      (e) => !e.message.includes(JSON.stringify(change)),
    );
});
test("card validation checks number, expiry and security code with sanitized errors", () => {
  assert.ok(contract);
  assert.deepEqual(
    contract.validateCard(
      { ...card, number: "4111 1111 1111 1111", ignored: "secret" },
      new Date("2026-10-19T00:00:00Z"),
    ),
    card,
  );
  for (const change of [
    { number: "4111111111111112" },
    { expiryMonth: "13" },
    { expiryYear: "2020" },
    { ccv: "x" },
  ])
    assert.throws(
      () => contract.validateCard({ ...card, ...change }),
      (e) => !e.message.includes(card.number) && !e.message.includes(card.ccv),
    );
});
test("payment snapshot validates money and whitelists only reconciliation data", () => {
  assert.ok(contract);
  assert.deepEqual(
    contract.validatePaymentSnapshot({ ...payment, creditCard: { number: card.number } }),
    {
      id: "pay_fixture",
      customerId: "cus_fixture",
      externalReference: attempt.externalReference,
      billingType: "CREDIT_CARD",
      valueCents: 10990,
      netValueCents: 10650,
      refundedValueCents: 0,
      status: "CONFIRMED",
    },
  );
  for (const value of [NaN, -1, 1.001, "109.9", Infinity, 21474836.48])
    assert.throws(() => contract.validatePaymentSnapshot({ ...payment, value }));
});
test("card creation uses the fixed API origin and long timeout and returns no raw card data", async () => {
  assert.ok(api, "Asaas payment client must exist");
  const snapshot = await api.createAsaasPayment(credentials, attempt, payer, card, "203.0.113.10", {
    fetch: async (url, init) => {
      assert.equal(url, "https://api-sandbox.asaas.com/v3/payments");
      assert.equal(init.method, "POST");
      assert.equal(init.redirect, "error");
      assert.equal(new Headers(init.headers).get("access_token"), credentials.apiKey);
      const body = JSON.parse(init.body);
      assert.equal(body.value, 109.9);
      assert.equal(body.remoteIp, "203.0.113.10");
      assert.equal(body.authorizeOnly, false);
      assert.equal(body.creditCard.number, card.number);
      assert.ok(init.signal instanceof AbortSignal);
      assert.equal(init.signal.aborted, false);
      return Response.json({ ...payment, creditCard: { creditCardToken: "must-not-return" } });
    },
  });
  assert.equal(snapshot.valueCents, 10990);
  assert.ok(!JSON.stringify(snapshot).includes("must-not-return"));
});
test("Pix creation does not send card fields and retrieves its QR data without a GET body", async () => {
  assert.ok(api);
  const snapshot = await api.createAsaasPayment(
    credentials,
    { ...attempt, billingType: "PIX" },
    payer,
    undefined,
    "203.0.113.10",
    {
      fetch: async (url, init) => {
        const b = JSON.parse(init.body);
        assert.equal(b.billingType, "PIX");
        assert.equal(b.creditCard, undefined);
        assert.equal(b.creditCardHolderInfo, undefined);
        return Response.json({ ...payment, billingType: "PIX", status: "PENDING" });
      },
    },
  );
  assert.equal(snapshot.status, "PENDING");
  assert.deepEqual(
    await api.getAsaasPix(credentials, "pay_fixture", {
      fetch: async (url, init) => {
        assert.equal(url, "https://api-sandbox.asaas.com/v3/payments/pay_fixture/pixQrCode");
        assert.equal(init.method, "GET");
        assert.equal(init.body, undefined);
        return Response.json({
          encodedImage: "aW1hZ2U=",
          payload: "000201fixture",
          expirationDate: "2030-01-01 23:59:59",
          other: "private",
        });
      },
    }),
    { encodedImage: "aW1hZ2U=", payload: "000201fixture", expirationDate: "2030-01-01 23:59:59" },
  );
});
test("timeouts and provider failures are inconclusive, while explicit card refusal is classified safely", async () => {
  assert.ok(api);
  for (const [status, code, kind] of [
    [400, "invalid_creditCard", "declined"],
    [400, "unknown", "uncertain"],
    [401, "invalid_access_token", "uncertain"],
    [500, "unknown", "uncertain"],
  ])
    await assert.rejects(
      api.createAsaasPayment(credentials, attempt, payer, card, "203.0.113.10", {
        fetch: async () =>
          Response.json(
            { errors: [{ code, description: card.number + credentials.apiKey }] },
            { status },
          ),
      }),
      (e) =>
        e.kind === kind &&
        !e.message.includes(card.number) &&
        !e.message.includes(credentials.apiKey),
    );
  await assert.rejects(
    api.createAsaasPayment(credentials, attempt, payer, card, "203.0.113.10", {
      fetch: async () => {
        throw Error(card.number);
      },
    }),
    (e) => e.kind === "uncertain" && !e.message.includes(card.number),
  );
});
test("customer reuse matches application reference and identity and refuses ambiguous matches", async () => {
  assert.ok(api);
  const customer = {
    id: "cus_fixture",
    externalReference: "pedetrem-user-fixture",
    cpfCnpj: payer.cpfCnpj,
  };
  assert.equal(
    await api.findOrCreateAsaasCustomer(credentials, "pedetrem-user-fixture", payer, {
      fetch: async (url, init) => {
        assert.equal(init.method, "GET");
        assert.ok(url.includes("externalReference=pedetrem-user-fixture"));
        return Response.json({ data: [customer] });
      },
    }),
    "cus_fixture",
  );
  for (const data of [
    [customer, customer],
    [{ ...customer, cpfCnpj: "11111111111" }],
    [{ ...customer, externalReference: "other-user" }],
  ])
    await assert.rejects(
      api.findOrCreateAsaasCustomer(credentials, "pedetrem-user-fixture", payer, {
        fetch: async () => Response.json({ data }),
      }),
    );
});
test("reconciliation refuses mismatched references, pagination and multiple payments instead of charging again", async () => {
  assert.ok(api);
  assert.deepEqual(
    await api.findAsaasPayments(credentials, attempt.externalReference, {
      fetch: async (url, init) => {
        assert.equal(init.body, undefined);
        return Response.json({ data: [payment], hasMore: false });
      },
    }),
    [contract.validatePaymentSnapshot(payment)],
  );
  for (const payload of [
    { data: [payment, payment] },
    { data: [{ ...payment, externalReference: "other" }] },
    { data: [payment], hasMore: true },
  ])
    await assert.rejects(
      api.findAsaasPayments(credentials, attempt.externalReference, {
        fetch: async () => Response.json(payload),
      }),
    );
});
test("invalid environment, card input and endpoint identifiers never trigger provider requests", async () => {
  assert.ok(api);
  let calls = 0;
  const options = {
    fetch: async () => {
      calls++;
      return Response.json(payment);
    },
  };
  await assert.rejects(
    api.createAsaasPayment(
      { ...credentials, environment: "toString" },
      attempt,
      payer,
      card,
      "203.0.113.10",
      options,
    ),
  );
  await assert.rejects(
    api.createAsaasPayment(
      credentials,
      attempt,
      payer,
      { ...card, number: "bad" },
      "203.0.113.10",
      options,
    ),
  );
  await assert.rejects(api.getAsaasPayment(credentials, "../../private", options));
  assert.equal(calls, 0);
});
test("card processing receives a 65-second deadline while reads retain eight seconds", async () => {
  const real = AbortSignal.timeout,
    deadlines = [];
  AbortSignal.timeout = (ms) => {
    deadlines.push(ms);
    return real(ms);
  };
  try {
    await api.createAsaasPayment(credentials, attempt, payer, card, "203.0.113.10", {
      fetch: async () => Response.json(payment),
    });
    assert.deepEqual(deadlines, [65000]);
    await api.getAsaasPayment(credentials, "pay_fixture", {
      fetch: async () => Response.json(payment),
    });
    assert.deepEqual(deadlines, [65000, 8000]);
  } finally {
    AbortSignal.timeout = real;
  }
});
test("new customer creation disables provider notifications and cancellation only acknowledges deletion", async () => {
  let posts = 0;
  assert.equal(
    await api.findOrCreateAsaasCustomer(credentials, "user-fixture", payer, {
      fetch: async (url, init) => {
        if (init.method === "GET") return Response.json({ data: [] });
        posts++;
        const body = JSON.parse(init.body);
        assert.equal(body.externalReference, "user-fixture");
        assert.equal(body.notificationDisabled, true);
        return Response.json({ id: "cus_created" });
      },
    }),
    "cus_created",
  );
  assert.equal(posts, 1);
  assert.equal(
    await api.cancelAsaasPayment(credentials, "pay_fixture", {
      fetch: async (url, init) => {
        assert.equal(init.method, "DELETE");
        assert.equal(init.body, undefined);
        return Response.json({ deleted: true });
      },
    }),
    undefined,
  );
  await assert.rejects(
    api.cancelAsaasPayment(credentials, "pay_fixture", {
      fetch: async () => Response.json({ status: "REFUNDED" }),
    }),
  );
});
