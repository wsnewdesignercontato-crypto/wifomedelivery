import test from "node:test";
import assert from "node:assert/strict";
const config = await import("../src/lib/asaas-config.ts").catch(() => null);
const api = await import("../src/lib/asaas-api.server.ts").catch(() => null);
const credentials = {
  environment: "sandbox",
  apiKey: "test-key-" + "a".repeat(40),
  webhookToken: "b".repeat(64),
  notificationEmail: "admin@example.com",
  revision: "revision",
  tested: true,
  webhookId: null,
};
test("Asaas settings validate secrets without returning supplied input in errors", () => {
  assert.ok(config, "Asaas settings validator must exist");
  const valid = config.validateAsaasSettings({
    environment: "sandbox",
    notificationEmail: " ADMIN@example.com ",
    apiKey: "  ",
    webhookToken: "",
  });
  assert.deepEqual(valid, {
    environment: "sandbox",
    notificationEmail: "admin@example.com",
    apiKey: undefined,
    webhookToken: undefined,
  });
  for (const change of [
    { environment: "staging" },
    { environment: "https://evil.example" },
    { apiKey: 23 },
    { apiKey: "short" },
    { apiKey: "x".repeat(20) + "\r\nsecret" },
    { webhookToken: "short" },
    { webhookToken: credentials.apiKey, apiKey: credentials.apiKey },
    { notificationEmail: "bad\nsecret" },
  ]) {
    assert.throws(
      () =>
        config.validateAsaasSettings({
          environment: "sandbox",
          notificationEmail: "admin@example.com",
          ...change,
        }),
      (e) => !e.message.includes("secret") && !e.message.includes(credentials.apiKey),
    );
  }
});
for (const environment of ["sandbox", "production"])
  test(`Asaas ${environment} connection only performs a bounded read without exposing the balance`, async () => {
    assert.ok(api, "Asaas API client must exist");
    const result = await api.testAsaasCredentials(
      { ...credentials, environment },
      {
        fetch: async (url, init) => {
          assert.equal(
            url,
            environment === "sandbox"
              ? "https://api-sandbox.asaas.com/v3/finance/balance"
              : "https://api.asaas.com/v3/finance/balance",
          );
          assert.equal(init.method, "GET");
          assert.equal(init.body, undefined);
          assert.equal(new Headers(init.headers).get("access_token"), credentials.apiKey);
          assert.ok(init.signal instanceof AbortSignal);
          return Response.json({ balance: 987654321 });
        },
      },
    );
    assert.equal(result, undefined);
  });
for (const status of [400, 401, 403, 429, 500])
  test(`Asaas HTTP ${status} never discloses credentials or raw provider errors`, async () => {
    assert.ok(api);
    await assert.rejects(
      api.testAsaasCredentials(credentials, {
        fetch: async () =>
          Response.json(
            { errors: [{ description: credentials.apiKey + " private-details" }] },
            { status },
          ),
      }),
      (e) => !e.message.includes(credentials.apiKey) && !e.message.includes("private-details"),
    );
  });
test("Asaas network failure is sanitized", async () => {
  assert.ok(api);
  await assert.rejects(
    api.testAsaasCredentials(credentials, {
      fetch: async () => {
        throw Error(credentials.apiKey);
      },
    }),
    (e) => !e.message.includes(credentials.apiKey),
  );
});
test("invalid environment cannot choose another API host", async () => {
  let calls = 0;
  await assert.rejects(
    api.testAsaasCredentials(
      { ...credentials, environment: "toString" },
      {
        fetch: async () => {
          calls++;
          return Response.json({ balance: 0 });
        },
      },
    ),
  );
  assert.equal(calls, 0);
});
test("a malformed success response cannot mark the API key as tested", async () => {
  await assert.rejects(
    api.testAsaasCredentials(credentials, { fetch: async () => Response.json({}) }),
  );
});
test("webhook creation uses its own secret and only payment events", async () => {
  assert.ok(api);
  const calls = [];
  const id = await api.ensureAsaasWebhook(
    credentials,
    "https://pedetrem.vercel.app/api/payments/asaas/webhook?environment=sandbox",
    {
      fetch: async (url, init) => {
        calls.push([url, init]);
        if (init.method === "GET") return Response.json({ data: [] });
        const payload = JSON.parse(init.body);
        assert.equal(payload.authToken, credentials.webhookToken);
        assert.notEqual(payload.authToken, credentials.apiKey);
        assert.equal(payload.sendType, "SEQUENTIALLY");
        assert.equal(payload.email, credentials.notificationEmail);
        assert.ok(payload.events.includes("PAYMENT_RECEIVED"));
        assert.ok(!payload.events.some((e) => e.startsWith("TRANSFER")));
        return Response.json({ id: "webhook-1" });
      },
    },
  );
  assert.equal(id, "webhook-1");
  assert.equal(calls.length, 2);
  assert.equal(calls[1][1].method, "POST");
});
test("retrying webhook registration updates the existing matching URL instead of creating another", async () => {
  assert.ok(api);
  const url = "https://pedetrem.vercel.app/api/payments/asaas/webhook?environment=sandbox";
  const calls = [];
  const id = await api.ensureAsaasWebhook(credentials, url, {
    fetch: async (endpoint, init) => {
      calls.push([endpoint, init.method]);
      return Response.json(
        init.method === "GET"
          ? {
              data: [
                { id: "other", url: "https://other.example/hook" },
                { id: "ours", url },
              ],
            }
          : { id: "ours" },
      );
    },
  });
  assert.equal(id, "ours");
  assert.equal(calls[1][1], "PUT");
  assert.ok(calls[1][0].endsWith("/webhooks/ours"));
});
test("webhook registration refuses an untested configuration and an insecure callback", async () => {
  assert.ok(api);
  let calls = 0;
  const options = {
    fetch: async () => {
      calls++;
      return Response.json({});
    },
  };
  await assert.rejects(
    api.ensureAsaasWebhook(
      { ...credentials, tested: false },
      "https://pedetrem.vercel.app/hook",
      options,
    ),
  );
  await assert.rejects(api.ensureAsaasWebhook(credentials, "http://evil.example/hook", options));
  assert.equal(calls, 0);
});
