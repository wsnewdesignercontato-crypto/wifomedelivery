import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Run the actual validators, middleware and handlers; only framework transport,
// authenticated Supabase context, service RPCs and provider I/O are substituted.
const runtime = {};
globalThis.__asaasServerTest = runtime;
const modules = {
  "@tanstack/react-start": `
    const flatten = entries => entries.flatMap(m => [...flatten(m.parents ?? []), m.fn]);
    export function createMiddleware() {
      const m = {parents: []};
      return {middleware(parents) {m.parents = parents; return this}, server(fn) {return {...m, fn}}};
    }
    export function createServerFn() {
      let middleware = [], validate = value => value;
      return {
        middleware(value) {middleware = value; return this},
        validator(value) {validate = value; return this},
        handler(fn) {return async input => {
          const steps = flatten(middleware);
          const run = async (index, context) => index === steps.length
            ? fn({context, data: validate(input.data)})
            : steps[index]({context, next: value => run(index + 1, {...context, ...value?.context})});
          return run(0, {});
        }}
      };
    }`,
  "@/integrations/supabase/auth-middleware": `
    export const requireSupabaseAuth = {fn: ({next}) => next({context: globalThis.__asaasServerTest.context})};`,
  "@/integrations/supabase/client.server": `
    export const supabaseAdmin = {rpc: (...args) => globalThis.__asaasServerTest.rpc(...args)};`,
  "./asaas-storage.server": `
    export const getAsaasCredentials = environment => globalThis.__asaasServerTest.credentials(environment);`,
  "./asaas-api.server": `
    export const testAsaasCredentials = (...args) => globalThis.__asaasServerTest.testConnection(...args);
    export const ensureAsaasWebhook = (...args) => globalThis.__asaasServerTest.ensure(...args);`,
  "./app-url": `export const resolveAppUrl = () => 'https://app.example.test';`,
};
const hooks = registerHooks({
  resolve(name, context, next) {
    if (modules[name])
      return {
        url: "data:text/javascript," + encodeURIComponent(modules[name]),
        shortCircuit: true,
      };
    if (
      name.startsWith("./") &&
      context.parentURL?.includes("/src/lib/") &&
      !/\.[a-z]+$/.test(name)
    )
      return next(name + ".ts", context);
    return next(name, context);
  },
});
// Keep hooks installed: server-only imports happen when the actual handler runs.
const handlers = await import("../src/lib/admin-asaas.functions.ts");
test.after(() => {
  hooks.deregister();
  delete globalThis.__asaasServerTest;
});

const input = (extra = {}) => ({ data: { environment: "sandbox", ...extra } });
const saveInput = () =>
  input({
    notificationEmail: "admin@example.test",
    apiKey: "fixture-api-key-" + "b".repeat(32),
    webhookToken: "b".repeat(64),
  });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function reset() {
  Object.assign(runtime, {
    events: [],
    freshReads: 0,
    roleReads: 0,
    authenticatedUser: { id: "admin-id", email_confirmed_at: "2026-10-19T00:00:00Z" },
    authError: null,
    role: true,
    roleError: null,
    fail: null,
    lease: null,
    leaseSequence: 0,
    row: {
      environment: "sandbox",
      notificationEmail: "admin@example.test",
      configured: true,
      tested: true,
      testedAt: null,
      webhookConfigured: false,
      webhookId: null,
      lastWebhookAt: null,
      revision: "A",
      apiKey: "fixture-api-key-" + "a".repeat(32),
      webhookToken: "a".repeat(64),
    },
  });
  runtime.context = {
    userId: "admin-id",
    supabase: {
      auth: {
        getUser: async () => {
          runtime.freshReads++;
          return { data: { user: runtime.authenticatedUser }, error: runtime.authError };
        },
      },
      rpc: async (name, args) => {
        runtime.roleReads++;
        assert.equal(name, "has_role");
        assert.deepEqual(args, { _user_id: "admin-id", _role: "admin" });
        return { data: runtime.role, error: runtime.roleError };
      },
    },
  };
  runtime.rpc = async (name, args) => {
    runtime.events.push({ name, args });
    if (runtime.fail === name) return { data: null, error: { message: "fixture failure" } };
    switch (name) {
      case "asaas_operation_acquire":
        if (runtime.lease) return { data: null, error: { message: "busy" } };
        runtime.lease = `lease-${++runtime.leaseSequence}`;
        return { data: runtime.lease, error: null };
      case "asaas_operation_release":
        assert.equal(args._operation_id, runtime.lease);
        runtime.lease = null;
        return { data: true, error: null };
      case "asaas_settings_get":
        return { data: { ...runtime.row }, error: null };
      case "asaas_settings_save":
        if (runtime.lease) return { data: null, error: { message: "busy" } };
        runtime.row = {
          ...runtime.row,
          apiKey: args._api_key ?? runtime.row.apiKey,
          webhookToken: args._webhook_token ?? runtime.row.webhookToken,
          revision: "B",
          tested: false,
          webhookConfigured: false,
        };
        return { data: {}, error: null };
      case "asaas_connection_complete":
        assert.equal(args._revision, runtime.row.revision);
        runtime.row.tested = args._success;
        return { data: true, error: null };
      case "asaas_webhook_complete":
        assert.equal(args._revision, runtime.row.revision);
        runtime.row.webhookConfigured = true;
        runtime.row.webhookId = args._webhook_id;
        return { data: true, error: null };
      default:
        throw Error(`Unexpected service RPC ${name}`);
    }
  };
  runtime.credentials = async (environment) => {
    runtime.events.push({ name: "credentials", environment });
    if (runtime.fail === "credentials") throw Error("fixture credentials unavailable");
    assert.equal(environment, "sandbox");
    return { ...runtime.row };
  };
  runtime.testConnection = async () => {
    runtime.events.push({ name: "test-provider" });
  };
  runtime.ensure = async (credentials, callback, options) => {
    runtime.events.push({ name: "provider-write", revision: credentials.revision });
    assert.ok(runtime.lease, "provider mutations require a held shared lease");
    assert.equal(
      callback,
      "https://app.example.test/api/payments/asaas/webhook?environment=sandbox",
    );
    assert.ok(options.signal instanceof AbortSignal, "registration has an overall deadline");
    if (runtime.fail === "provider") throw Error("fixture provider failure");
    return "webhook-fixture";
  };
}

for (const name of [
  "getAsaasSettings",
  "saveAsaasSettings",
  "testAsaasConnection",
  "registerAsaasWebhook",
]) {
  test(`${name} checks fresh confirmed identity and current admin role before privileged work`, async () => {
    const request = name === "saveAsaasSettings" ? saveInput : input;
    for (const failure of [
      { authenticatedUser: null },
      { authError: { message: "revoked" } },
      { authenticatedUser: { id: "different-id", email_confirmed_at: "confirmed" } },
      { authenticatedUser: { id: "admin-id", email_confirmed_at: null } },
      { role: false },
      { roleError: { message: "unavailable" } },
    ]) {
      reset();
      Object.assign(runtime, failure);
      await assert.rejects(handlers[name](request()), /Unauthorized|Forbidden/);
      assert.equal(runtime.freshReads, 1);
      assert.deepEqual(
        runtime.events,
        [],
        "denial must precede credential reads, service RPCs and provider calls",
      );
    }
    reset();
    await handlers[name](request());
    runtime.events = [];
    runtime.role = false;
    await assert.rejects(handlers[name](request()), /Forbidden/);
    assert.equal(runtime.freshReads, 2);
    assert.equal(runtime.roleReads, 2);
    assert.deepEqual(runtime.events, [], "a previous successful authorization cannot be reused");
  });
}

test("status DTO never includes secrets even when the service row contains them", async () => {
  reset();
  const status = await handlers.getAsaasSettings(input());
  assert.equal("apiKey" in status, false);
  assert.equal("webhookToken" in status, false);
  assert.ok(!JSON.stringify(status).includes(runtime.row.apiKey));
  assert.ok(!JSON.stringify(status).includes(runtime.row.webhookToken));
});

test("registration A blocks save and registration B until release, then B uses only the new revision", async () => {
  reset();
  const started = deferred(),
    finish = deferred();
  const writes = [];
  const ensure = runtime.ensure;
  runtime.ensure = async (...args) => {
    await ensure(...args);
    if (args[0].revision === "A") {
      started.resolve();
      await finish.promise;
    }
    writes.push(args[0].revision);
    return "webhook-fixture";
  };
  const a = handlers.registerAsaasWebhook(input());
  await started.promise;
  try {
    const credentialsPosition = runtime.events.findIndex((e) => e.name === "credentials");
    assert.equal(runtime.events[credentialsPosition - 1].name, "asaas_operation_acquire");
    await assert.rejects(handlers.saveAsaasSettings(saveInput()));
    const before = runtime.events.length;
    await assert.rejects(handlers.registerAsaasWebhook(input()));
    assert.deepEqual(
      runtime.events.slice(before).map((e) => e.name),
      ["asaas_operation_acquire"],
    );
    assert.equal(runtime.row.revision, "A");
    assert.deepEqual(writes, []);
  } finally {
    finish.resolve();
    await a;
  }
  assert.equal(runtime.lease, null);
  await handlers.saveAsaasSettings(saveInput());
  await handlers.testAsaasConnection(input());
  await handlers.registerAsaasWebhook(input());
  assert.deepEqual(writes, ["A", "B"]);
  assert.equal(runtime.row.revision, "B");
  assert.equal(runtime.row.webhookConfigured, true);
  assert.equal(runtime.lease, null);
  assert.equal(runtime.events.filter((e) => e.name === "asaas_operation_release").length, 2);
});

for (const stage of ["credentials", "asaas_settings_get", "provider", "asaas_webhook_complete"]) {
  test(`registration releases the lease when ${stage} fails and permits a later retry`, async () => {
    reset();
    runtime.fail = stage;
    await assert.rejects(handlers.registerAsaasWebhook(input()));
    assert.equal(runtime.lease, null);
    assert.equal(runtime.events.at(-1).name, "asaas_operation_release");
    assert.equal(runtime.row.webhookConfigured, false);
    runtime.fail = null;
    await handlers.registerAsaasWebhook(input());
    assert.equal(runtime.row.webhookConfigured, true);
    assert.equal(runtime.lease, null);
  });
}
