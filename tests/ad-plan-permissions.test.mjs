import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCheckoutDatabase } from "../scripts/testing/checkout-database.mjs";
test("administrators can manage ad plans while ordinary users can only read active plans", async () => {
  const db = await createCheckoutDatabase();
  try {
    const admin = "81000000-0000-4000-8000-000000000001",
      customer = "81000000-0000-4000-8000-000000000002";
    await db.query(
      "insert into auth.users(id,email) values($1,'admin@example.invalid'),($2,'customer@example.invalid')",
      [admin, customer],
    );
    await db.query("insert into public.user_roles(user_id,role) values($1,'admin')", [admin]);
    await db.exec(`REVOKE ALL ON public.ad_plans FROM authenticated; GRANT SELECT ON public.ad_plans TO authenticated;
 ALTER TABLE public.ad_plans ENABLE ROW LEVEL SECURITY;
 CREATE POLICY "ad_plans read active" ON public.ad_plans FOR SELECT USING (ativo OR private.has_role(auth.uid(),'admin'::public.app_role));
 CREATE POLICY "ad_plans admin manage" ON public.ad_plans FOR ALL USING (private.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK(private.has_role(auth.uid(),'admin'::public.app_role));`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
    await db.exec("set role authenticated");
    await assert.rejects(
      db.query("insert into public.ad_plans(nome) values('Blocked before grant')"),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261018163527_fix_ad_plan_admin_permissions.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec("set role authenticated");
    const id = (
      await db.query(
        "insert into public.ad_plans(nome,preco_cents,ativo) values('Test plan',4990,true) returning id",
      )
    ).rows[0].id;
    assert.equal(
      (
        await db.query(
          "update public.ad_plans set preco_cents=5990 where id=$1 returning preco_cents",
          [id],
        )
      ).rows[0].preco_cents,
      5990,
    );
    await db.query("insert into public.ad_plans(nome,ativo) values('Inactive',false)");
    assert.equal((await db.query("select count(*)::int as n from public.ad_plans")).rows[0].n, 2);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [customer]);
    assert.equal((await db.query("select count(*)::int as n from public.ad_plans")).rows[0].n, 1);
    await assert.rejects(
      db.query("insert into public.ad_plans(nome) values('Unauthorized')"),
      /row-level security/,
    );
    assert.equal(
      (await db.query("update public.ad_plans set preco_cents=0 where id=$1 returning id", [id]))
        .rows.length,
      0,
    );
    assert.equal(
      (await db.query("delete from public.ad_plans where id=$1 returning id", [id])).rows.length,
      0,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
    assert.equal(
      (await db.query("select preco_cents from public.ad_plans where id=$1", [id])).rows[0]
        .preco_cents,
      5990,
    );
    assert.equal(
      (await db.query("delete from public.ad_plans where id=$1 returning id", [id])).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});
