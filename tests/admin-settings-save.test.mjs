import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const state = {
  user: { id: "admin-id" },
  authError: null,
  result: { data: { id: 1, commission_pct: 8 }, error: null },
  writes: [],
};
globalThis.__settingsSave = state;
const hooks = registerHooks({
  resolve(name, ctx, next) {
    if (name !== "@/integrations/supabase/client") return next(name, ctx);
    return {
      shortCircuit: true,
      url:
        "data:text/javascript," +
        encodeURIComponent(
          `export const supabase={auth:{getUser:async()=>({data:{user:globalThis.__settingsSave.user},error:globalThis.__settingsSave.authError})},from(table){const r=globalThis.__settingsSave;return {update(values){r.writes.push({table,values});return this},eq(field,value){r.writes.at(-1).where=[field,value];return this},select(){return this},single:async()=>r.result}}};`,
        ),
    };
  },
});
const { persistPlatformSettings } = await import("../src/lib/admin-settings-save.ts");
test.after(() => {
  hooks.deregister();
  delete globalThis.__settingsSave;
});
test("settings save returns the persisted singleton rather than assuming the write succeeded", async () => {
  const result = await persistPlatformSettings({
    commission_pct: 8,
    support_email: "",
    support_phone: "",
    support_whatsapp: "35988183921",
  });
  assert.equal(result.commission_pct, 8);
  assert.deepEqual(state.writes[0].where, ["id", 1]);
  assert.equal(state.writes[0].values.updated_by, "admin-id");
  assert.equal(state.writes[0].values.support_email, null);
});
test("a missing persisted row or database failure cannot produce a success response", async () => {
  state.result = { data: null, error: null };
  await assert.rejects(persistPlatformSettings({ commission_pct: 8 }), /salvar|confirmar/i);
  state.result = { data: null, error: { code: "42501" } };
  await assert.rejects(persistPlatformSettings({ commission_pct: 8 }), /permissão/i);
});
test("a missing session is handled without a write or null-user crash", async () => {
  state.user = null;
  const count = state.writes.length;
  await assert.rejects(persistPlatformSettings({ commission_pct: 8 }), /sessão|novamente/i);
  assert.equal(state.writes.length, count);
});
