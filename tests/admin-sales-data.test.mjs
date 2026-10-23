import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const state = { rows: [], reads: [], error: false, failAt: null };
globalThis.__adminSalesReads = state;
const hooks = registerHooks({
  resolve(name, context, next) {
    if (name !== "@/integrations/supabase/client") return next(name, context);
    return {
      shortCircuit: true,
      url:
        "data:text/javascript," +
        encodeURIComponent(
          `export const supabase={from(table){const s=globalThis.__adminSalesReads;const read={table};s.reads.push(read);return {select(fields){read.fields=fields;return this},eq(field,value){read.filter=[field,value];return this},gte(field,value){read.since=[field,value];return this},order(){return this},range(from,to){read.range=[from,to];const failed=s.error||from===s.failAt;return Promise.resolve({data:failed?null:s.rows.slice(from,to+1),error:failed?{message:'access denied'}:null})}}}};`,
        ),
    };
  },
});
const { loadAdminSales } = await import("../src/lib/admin-sales-data.ts");
test.after(() => {
  hooks.deregister();
  delete globalThis.__adminSalesReads;
});
test("admin sale reads include payment confirmation, exclude tests and paginate past the API row cap", async () => {
  state.rows = Array.from({ length: 1201 }, (_, i) => ({ id: String(i) }));
  state.reads = [];
  state.error = false;
  assert.equal((await loadAdminSales("2026-10-01T03:00:00.000Z")).length, 1201);
  assert.equal(state.reads.length, 2);
  assert.deepEqual(state.reads[0].filter, ["is_test", false]);
  assert.deepEqual(state.reads[1].range, [1000, 1999]);
  assert.deepEqual(state.reads[0].since, ["created_at", "2026-10-01T03:00:00.000Z"]);
  assert.match(state.reads[0].fields, /online_payment_state/);
  assert.match(state.reads[0].fields, /payment_channel/);
});
test("a failed sales query is surfaced instead of pretending the platform had zero sales", async () => {
  state.error = true;
  await assert.rejects(loadAdminSales(), /access denied/);
});

test("a later-page failure rejects the whole report instead of returning an incomplete total", async () => {
  state.error = false;
  state.failAt = 1000;
  state.rows = Array.from({ length: 1201 }, (_, i) => ({ id: String(i) }));
  await assert.rejects(loadAdminSales(), /access denied/);
});
