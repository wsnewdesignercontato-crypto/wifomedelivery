import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const state = { rows: [], reads: 0, failAt: null, allowed: true, roleError: null };
globalThis.__commissionReads = state;
const hooks = registerHooks({
  resolve(name, ctx, next) {
    let source;
    if (name === "@tanstack/react-start")
      source =
        "export const createServerFn=()=>({middleware(){return this},handler(fn){return fn}});";
    if (name === "@/integrations/supabase/auth-middleware")
      source = "export const requireSupabaseAuth={};";
    if (name === "@/integrations/supabase/client.server")
      source = `export const supabaseAdmin={from(){const s=globalThis.__commissionReads;s.reads++;return {select(){return this},eq(){return this},order(){return this},range(from,to){return Promise.resolve({data:from===s.failAt?null:s.rows.slice(from,to+1),error:from===s.failAt?{message:'query failed'}:null})}}}};`;
    return source
      ? { shortCircuit: true, url: "data:text/javascript," + encodeURIComponent(source) }
      : next(name, ctx);
  },
});
const { getAdminCommissionOrders } = await import("../src/lib/admin-commissions.functions.ts");
const context = {
  userId: "admin",
  supabase: { rpc: async () => ({ data: state.allowed, error: state.roleError }) },
};
test.after(() => {
  hooks.deregister();
  delete globalThis.__commissionReads;
});
test("nonadmins and role lookup failures never read privileged financial columns", async () => {
  state.allowed = false;
  await assert.rejects(getAdminCommissionOrders({ context }), /Forbidden/);
  assert.equal(state.reads, 0);
  state.allowed = true;
  state.roleError = { message: "denied" };
  await assert.rejects(getAdminCommissionOrders({ context }), /Forbidden/);
  assert.equal(state.reads, 0);
  state.roleError = null;
});
test("authorized reads paginate and reject a partial report on a later-page error", async () => {
  state.rows = Array.from({ length: 1201 }, (_, i) => ({
    id: String(i),
    establishments: { nome: "Store" },
  }));
  assert.equal((await getAdminCommissionOrders({ context })).length, 1201);
  state.failAt = 1000;
  await assert.rejects(getAdminCommissionOrders({ context }), /query failed/);
});
