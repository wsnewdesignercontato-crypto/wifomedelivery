import test from "node:test";
import assert from "node:assert/strict";
const mod = await import("../src/lib/asaas-payment-worker.server.ts").catch(() => null);
test("worker uses a dedicated secret and refuses missing or incorrect authentication", async () => {
  assert.ok(mod);
  const request = (s) =>
    new Request("https://app.test/api/internal/asaas-reconcile", {
      method: "POST",
      headers: s ? { "x-asaas-reconcile-secret": s } : {},
    });
  assert.equal(mod.authorizeAsaasWorker(request(), "a".repeat(64)), false);
  assert.equal(mod.authorizeAsaasWorker(request("a".repeat(64)), "b".repeat(64)), false);
  assert.equal(mod.authorizeAsaasWorker(request("a".repeat(64)), "a".repeat(64)), true);
  assert.equal(mod.authorizeAsaasWorker(request("a".repeat(64)), undefined), false);
});
function fixture() {
  let claimed = false;
  const completions = [];
  let applies = 0;
  const attempt = {
    attemptId: "attempt",
    userId: "user",
    orderId: "order",
    paymentId: "pay",
    expiresAt: "2030-01-01",
    environment: "production",
  };
  const work = {
    workId: "work",
    operationId: "op",
    kind: "attempt",
    environment: "production",
    paymentId: "pay",
    attempt,
  };
  const deps = {
    claim: async (limit) => {
      assert.equal(limit, 10);
      if (claimed) return [];
      claimed = true;
      return [work];
    },
    complete: async (w, outcome) => {
      completions.push({ id: w.workId, outcome });
      return true;
    },
    context: async () => attempt,
    credentials: async () => ({ environment: "production", apiKey: "fixture" }),
    fetchPayment: async () => ({ externalReference: "foreign" }),
    match: async () => null,
    service: {
      reconcilePayment: async () => {
        applies++;
        return { state: "confirmed" };
      },
      cancelPayment: async () => ({ state: "cancel_pending" }),
    },
  };
  return {
    deps,
    work,
    completions,
    get applies() {
      return applies;
    },
  };
}
test("parallel workers claim once and persist before acknowledging work", async () => {
  assert.ok(mod);
  const f = fixture();
  await Promise.all([
    mod.createPaymentWorker(f.deps)({ limit: 10, budgetMs: 70000 }),
    mod.createPaymentWorker(f.deps)({ limit: 10, budgetMs: 70000 }),
  ]);
  assert.equal(f.applies, 1);
  assert.deepEqual(f.completions, [{ id: "work", outcome: "done" }]);
});
test("failed persistence is retried and never acknowledged as done", async () => {
  assert.ok(mod);
  const f = fixture();
  f.deps.service.reconcilePayment = async () => {
    throw Error("fixture");
  };
  const result = await mod.createPaymentWorker(f.deps)({ limit: 10, budgetMs: 70000 });
  assert.equal(result.failed, 1);
  assert.equal(f.completions[0].outcome, "retry");
});
test("worker reconciles before expiry cancellation and leaves uncertainty pending", async () => {
  assert.ok(mod);
  const f = fixture();
  f.work.attempt.expiresAt = "2020-01-01";
  const events = [];
  f.deps.service.reconcilePayment = async () => {
    events.push("read");
    return { state: "uncertain" };
  };
  f.deps.service.cancelPayment = async () => {
    events.push("cancel");
    return { state: "cancel_pending" };
  };
  await mod.createPaymentWorker(f.deps)({ limit: 10, budgetMs: 70000 });
  assert.deepEqual(events, ["read", "cancel"]);
});
test("budget exhaustion defers work without beginning another provider call", async () => {
  assert.ok(mod);
  const f = fixture();
  let time = 0;
  const worker = mod.createPaymentWorker({ ...f.deps, now: () => (time += 40000) });
  await worker({ limit: 10, budgetMs: 70000 });
  assert.equal(f.applies, 0);
  assert.equal(f.completions[0].outcome, "retry");
});
test("historical webhook work selects the known attempt account before fetching the provider", async () => {
  const f = fixture();
  f.work.kind = "event";
  f.work.eventId = "evt_history";
  f.deps.eventContext = async () => ({ ...f.work.attempt, revision: "old-account" });
  f.deps.credentials = async (environment, revision) => {
    assert.equal(revision, "old-account");
    return { environment, apiKey: "fixture" };
  };
  await mod.createPaymentWorker(f.deps)({ limit: 10, budgetMs: 70000 });
  assert.equal(f.completions[0].outcome, "done");
  assert.equal(f.applies, 1);
});
