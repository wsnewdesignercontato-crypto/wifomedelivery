import test, { after } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const stub = `export function createServerFn(){let parse=(x)=>x,auth=false;return {middleware(m){auth=m.some(x=>x.requiresAuth);return this},validator(fn){parse=fn;return this},handler(fn){return async ({data,context}={})=>{if(auth&&!context?.supabase)throw Error('Unauthorized');return fn({data:parse(data),context})}}}}`;
const hooks = registerHooks({
  resolve(name, context, next) {
    const stubs = {
      "@tanstack/react-start": stub,
      "@tanstack/react-start/server":
        "export function getRequest(){return globalThis.__pwaObservationRequest}",
      "@/integrations/supabase/auth-middleware":
        "export const requireSupabaseAuth={requiresAuth:true}",
      "@/integrations/supabase/client.server":
        "export const supabaseAdmin={rpc:(...args)=>globalThis.__pwaObservationRpc(...args)}",
    };
    if (stubs[name])
      return { url: "data:text/javascript," + encodeURIComponent(stubs[name]), shortCircuit: true };
    if (name === "@/lib/app-install-record" || name === "@/lib/app-install-origin") {
      return {
        url: new URL(`../src/lib/${name.split("/").pop()}.ts`, import.meta.url).href,
        shortCircuit: true,
      };
    }
    return next(name, context);
  },
});
after(() => hooks.deregister());
const { observeAppInstall, getAppInstallMetrics } =
  await import("../src/lib/app-install.functions.ts");
const input = {
  appType: "cliente",
  installationId: "20000000-0000-4000-8000-000000000001",
  evidence: "appinstalled",
  installed: true,
};
const result = {
  updatedAt: "2026-10-17T14:00:00Z",
  apps: ["cliente", "estabelecimento", "entrega"].map((appType) => ({
    appType,
    activeInstalls: 0,
    historicalInstalls: 0,
    identifiedAccounts: 0,
    lastObservedAt: null,
  })),
};

test("public observer accepts no login and forwards only checked telemetry without returning rows", async () => {
  const calls = [];
  globalThis.__pwaObservationRequest = new Request("http://pedetrem.vercel.app/_serverFn/x", {
    headers: { Origin: "https://pedetrem.vercel.app" },
  });
  globalThis.__pwaObservationRpc = async (...args) => {
    calls.push(args);
    return { data: null, error: null };
  };
  assert.deepEqual(await observeAppInstall({ data: input }), { ok: true });
  assert.deepEqual(calls, [
    [
      "observe_pwa_install",
      {
        p_app_type: "cliente",
        p_installation_id: input.installationId,
        p_evidence: "appinstalled",
        p_installed: true,
      },
    ],
  ]);
  await assert.rejects(observeAppInstall({ data: { ...input, user_id: input.installationId } }));
  globalThis.__pwaObservationRequest = new Request("https://pedetrem.vercel.app", {
    headers: { Origin: "https://evil.example" },
  });
  await assert.rejects(observeAppInstall({ data: input }), /origin/i);
  assert.equal(calls.length, 1);
});

test("only an authenticated current admin can query aggregate installation metrics", async () => {
  let privilegedCalls = 0;
  const roleCalls = [];
  globalThis.__pwaObservationRpc = async (name) => {
    privilegedCalls++;
    assert.equal(name, "admin_pwa_install_metrics");
    return { data: { ...result, installation_id: input.installationId }, error: null };
  };
  await assert.rejects(getAppInstallMetrics(), /Unauthorized/);
  for (const denied of [
    { data: false, error: null },
    { data: true, error: { message: "database unavailable" } },
  ]) {
    await assert.rejects(
      getAppInstallMetrics({
        context: { userId: input.installationId, supabase: { rpc: async () => denied } },
      }),
      /Forbidden/,
    );
  }
  assert.equal(privilegedCalls, 0);
  const context = {
    userId: input.installationId,
    supabase: {
      rpc: async (...args) => {
        roleCalls.push(args);
        return { data: true, error: null };
      },
    },
  };
  assert.deepEqual(await getAppInstallMetrics({ context }), result);
  assert.deepEqual(roleCalls, [["has_role", { _user_id: input.installationId, _role: "admin" }]]);
  assert.equal(privilegedCalls, 1);
});
