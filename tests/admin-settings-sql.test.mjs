import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCheckoutDatabase } from "../scripts/testing/checkout-database.mjs";
const admin = "bb000000-0000-4000-8000-000000000001",
  customer = "bb000000-0000-4000-8000-000000000002";
let db;
test.before(async () => {
  db = await createCheckoutDatabase();
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261016025223_support_runtime_settings.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const audit = await readFile(
    new URL(
      "../supabase/migrations/20260816200000_fix_admin_audit_and_delivery_confirmation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(audit.split("CREATE OR REPLACE FUNCTION public.admin_grant_role")[0]);
  await db.exec(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('${admin}','settings-admin@example.invalid',now()),('${customer}','settings-customer@example.invalid',now());
    INSERT INTO public.user_roles(user_id,role) VALUES('${admin}','admin');
    INSERT INTO public.platform_settings(id) VALUES(1);
    REVOKE ALL ON public.platform_settings FROM authenticated,anon;
    GRANT SELECT,TRUNCATE,REFERENCES,TRIGGER ON public.platform_settings TO authenticated;
    GRANT TRUNCATE,REFERENCES,TRIGGER ON public.platform_settings TO anon;
    ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
    CREATE POLICY settings_admin_read ON public.platform_settings FOR SELECT TO authenticated USING(private.has_role(auth.uid(),'admin'));
    CREATE POLICY settings_admin_update ON public.platform_settings FOR UPDATE TO authenticated USING(private.has_role(auth.uid(),'admin')) WITH CHECK(private.has_role(auth.uid(),'admin'));
    CREATE TRIGGER trg_audit_platform_settings AFTER UPDATE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION private.audit_platform_settings_change();`);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261023214925_restore_admin_platform_settings_updates.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
});
test.after(async () => {
  if (db) await db.close();
});
async function user(id) {
  await db.exec(
    `RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id}',false)`,
  );
}
test("an admin can save commission, freight, radius and contact and read the persisted row", async () => {
  await user(admin);
  const { rows } = await db.query(
    `UPDATE public.platform_settings SET commission_pct=8,default_delivery_fee_cents=900,default_radius_km=6,support_whatsapp='35988183921',updated_by=auth.uid(),updated_at=now() WHERE id=1 RETURNING commission_pct,default_delivery_fee_cents,default_radius_km`,
  );
  assert.equal(Number(rows[0].commission_pct), 8);
  assert.equal(rows[0].default_delivery_fee_cents, 900);
  await db.exec("RESET ROLE");
  const audit = (
    await db.query(
      `SELECT entity_id,metadata FROM public.admin_audit_log WHERE action='platform_settings.update'`,
    )
  ).rows;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].entity_id, "1");
  assert.equal(audit[0].metadata.commission_pct.new, 8);
});
test("ordinary authenticated accounts cannot edit or read the administrative settings", async () => {
  await user(customer);
  assert.equal(
    (await db.query("UPDATE public.platform_settings SET commission_pct=0 WHERE id=1 RETURNING id"))
      .rows.length,
    0,
  );
  assert.equal((await db.query("SELECT id FROM public.platform_settings")).rows.length, 0);
});
test("the save permission grants no destructive operation or singleton identity edit", async () => {
  await user(admin);
  await assert.rejects(db.exec("TRUNCATE public.platform_settings"), /permission denied/);
  await assert.rejects(db.exec("DELETE FROM public.platform_settings"), /permission denied/);
  await assert.rejects(
    db.exec("UPDATE public.platform_settings SET id=2 WHERE id=1"),
    /permission denied/,
  );
  await db.exec("RESET ROLE; SET ROLE anon");
  await assert.rejects(
    db.exec("UPDATE public.platform_settings SET commission_pct=0 WHERE id=1"),
    /permission denied/,
  );
  await assert.rejects(db.exec("TRUNCATE public.platform_settings"), /permission denied/);
});
