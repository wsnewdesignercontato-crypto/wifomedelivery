import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const stub = `export function createServerFn(){let parse=(x)=>x;return {middleware(m){if(m.length!==1||!m[0].requiresAuth)throw Error('Missing auth middleware');return this},validator(fn){parse=fn;return this},handler(fn){return ({data,context})=>fn({data:parse(data),context})}}}`;
const hooks = registerHooks({
  resolve(name, context, next) {
    if (name === "@tanstack/react-start")
      return { url: "data:text/javascript," + encodeURIComponent(stub), shortCircuit: true };
    if (name === "@/integrations/supabase/auth-middleware")
      return {
        url: "data:text/javascript,export const requireSupabaseAuth={requiresAuth:true};",
        shortCircuit: true,
      };
    if (name === "@/lib/app-install-record")
      return {
        url: new URL("../src/lib/app-install-record.ts", import.meta.url).href,
        shortCircuit: true,
      };
    return next(name, context);
  },
});
const { recordAppInstall } = await import("../src/lib/app-install.functions.ts");
hooks.deregister();

const installationId = "20000000-0000-4000-8000-000000000001";
const input = { appType: "cliente", installationId, evidence: "standalone", installed: true };
const result = {
  user_id: "10000000-0000-4000-8000-000000000001",
  app_type: "cliente",
  installation_id: installationId,
  installed: true,
  evidence: "standalone",
  installed_at: "2026-10-17T13:00:00Z",
  last_opened_at: "2026-10-17T13:00:00Z",
};

test("installation endpoint uses authenticated client and accepts no owner or date fields", async () => {
  const calls = [];
  const context = {
    supabase: {
      rpc: async (...args) => {
        calls.push(args);
        return { data: result, error: null };
      },
    },
  };
  assert.deepEqual(await recordAppInstall({ data: input, context }), result);
  assert.deepEqual(calls, [
    [
      "record_app_install",
      {
        p_app_type: "cliente",
        p_installation_id: installationId,
        p_evidence: "standalone",
        p_installed: true,
      },
    ],
  ]);
  await assert.rejects(async () =>
    recordAppInstall({ data: { ...input, user_id: result.user_id }, context }),
  );
  assert.equal(calls.length, 1);
});

test("installation endpoint surfaces rejected writes so the client can retry later", async () => {
  await assert.rejects(
    recordAppInstall({
      data: input,
      context: {
        supabase: { rpc: async () => ({ data: null, error: { message: "permission denied" } }) },
      },
    }),
    /permission denied/,
  );
});
