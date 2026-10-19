import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const r = { allowed: false, mutations: 0 };
globalThis.__accountAuthTest = r;
const mocks = {
  "@tanstack/react-start": `export function createServerFn(){let validate=x=>x;return {middleware(){return this},validator(v){validate=v;return this},handler(fn){return input=>fn({data:validate(input.data),context:{userId:'actor',supabase:{rpc:async()=>({data:globalThis.__accountAuthTest.allowed,error:null})}}})}}}`,
  "@/integrations/supabase/auth-middleware": `export const requireSupabaseAuth={};`,
  "@/integrations/supabase/client.server": `export const supabaseAdmin={};`,
  "@/lib/admin-account-actions.server": `export const applyAccountAction=async()=>{globalThis.__accountAuthTest.mutations++;return {ok:true}};`,
};
const hooks = registerHooks({
  resolve(n, c, next) {
    if (mocks[n])
      return { url: "data:text/javascript," + encodeURIComponent(mocks[n]), shortCircuit: true };
    return next(n, c);
  },
});
const { manageAppUser } = await import("../src/lib/admin-users.functions.ts");
const data = {
  targetUserId: "10000000-0000-4000-8000-000000000002",
  action: "block",
  confirmedEmail: "fixture@example.invalid",
};
test("non-admin requests never import or execute administrative Auth mutations", async () => {
  r.allowed = false;
  r.mutations = 0;
  await assert.rejects(manageAppUser({ data }), /admin only/);
  assert.equal(r.mutations, 0);
});
test("admin authorization is rechecked on each action", async () => {
  r.allowed = true;
  r.mutations = 0;
  assert.equal((await manageAppUser({ data })).ok, true);
  r.allowed = false;
  await assert.rejects(manageAppUser({ data }), /admin only/);
  assert.equal(r.mutations, 1);
});
test.after(() => {
  hooks.deregister();
  delete globalThis.__accountAuthTest;
});
