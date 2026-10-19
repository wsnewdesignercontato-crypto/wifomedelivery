import test from "node:test";
import assert from "node:assert/strict";
const hook = await import("../src/lib/asaas-webhook.server.ts").catch(() => null);
const secret = "b".repeat(64);
const body = {
  id: "evt_1",
  event: "PAYMENT_RECEIVED",
  payment: {
    id: "pay_1",
    status: "RECEIVED",
    customer: "do-not-store",
    creditCard: { number: "do-not-store" },
  },
};
const make = (payload = body, token = secret, environment = "sandbox") =>
  new Request("https://pedetrem.vercel.app/api/payments/asaas/webhook?environment=" + environment, {
    method: "POST",
    headers: { "Content-Type": "application/json", "asaas-access-token": token },
    body: JSON.stringify(payload),
  });
function deps() {
  const calls = [];
  const ids = new Set();
  return {
    calls,
    getCredentials: async (environment) => ({
      environment,
      apiKey: "private-key",
      webhookToken: secret,
    }),
    record: async (event) => {
      calls.push(event);
      const exists = ids.has(event.id);
      ids.add(event.id);
      return !exists;
    },
  };
}
test("webhook rejects missing/wrong token and wrong environment before persistence", async () => {
  assert.ok(hook, "Asaas webhook receiver must exist");
  const d = deps();
  assert.equal((await hook.handleAsaasWebhook(make(body, ""), d)).status, 401);
  assert.equal((await hook.handleAsaasWebhook(make(body, "wrong"), d)).status, 401);
  assert.equal((await hook.handleAsaasWebhook(make(body, secret, "unknown"), d)).status, 400);
  assert.equal(d.calls.length, 0);
});
test("authenticated webhook persists only event metadata and acknowledges duplicate deliveries", async () => {
  assert.ok(hook);
  const d = deps();
  let response = await hook.handleAsaasWebhook(make(), d);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true, duplicate: false });
  assert.deepEqual(d.calls[0], {
    environment: "sandbox",
    id: "evt_1",
    event: "PAYMENT_RECEIVED",
    paymentId: "pay_1",
    paymentStatus: "RECEIVED",
  });
  response = await hook.handleAsaasWebhook(make(), d);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true, duplicate: true });
  assert.ok(!JSON.stringify(d.calls).includes("do-not-store"));
});
test("webhook does not acknowledge persistence failure or expose private errors", async () => {
  assert.ok(hook);
  const d = deps();
  d.record = async () => {
    throw Error(secret);
  };
  const response = await hook.handleAsaasWebhook(make(), d);
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes(secret));
});
test("webhook refuses oversized and invalid payloads", async () => {
  assert.ok(hook);
  const d = deps();
  assert.equal((await hook.handleAsaasWebhook(make({ event: "PAYMENT_RECEIVED" }), d)).status, 400);
  assert.equal(
    (await hook.handleAsaasWebhook(make({ ...body, padding: "x".repeat(70000) }), d)).status,
    413,
  );
  assert.equal(d.calls.length, 0);
});
