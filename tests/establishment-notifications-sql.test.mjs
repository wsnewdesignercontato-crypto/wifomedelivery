import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCheckoutDatabase } from "../scripts/testing/checkout-database.mjs";

const migration = new URL(
  "../supabase/migrations/20261018045416_establishment_approval_notifications.sql",
  import.meta.url,
);
const owner = "10000000-0000-4000-8000-000000000001";
const admin = "10000000-0000-4000-8000-000000000002";
const otherAdmin = "10000000-0000-4000-8000-000000000003";
const store = "20000000-0000-4000-8000-000000000001";
const newStore = "20000000-0000-4000-8000-000000000002";

test("store registrations alert admins and approval alerts only the owner, atomically and without duplicates", async () => {
  const db = await createCheckoutDatabase();
  try {
    await db.exec(`
      INSERT INTO auth.users(id) VALUES ('${owner}'),('${admin}'),('${otherAdmin}');
      INSERT INTO public.user_roles(user_id,role) VALUES
        ('${owner}','estabelecimento'),('${admin}','admin'),('${otherAdmin}','admin');
      CREATE POLICY test_admin_establishments ON public.establishments TO authenticated
        USING(private.has_role(auth.uid(),'admin')) WITH CHECK(private.has_role(auth.uid(),'admin'));
      INSERT INTO public.establishments(id,owner_id,nome,status)
        VALUES('${store}','${owner}','Loja anterior','pendente');
    `);
    const sql = await readFile(migration, "utf8");
    await db.exec(sql);
    let rows = (await db.query("SELECT user_id,audience,link_url FROM public.notifications")).rows;
    assert.equal(rows.length, 2, "existing pending stores must appear in the admin queue");
    assert.deepEqual(rows.map((r) => r.user_id).sort(), [admin, otherAdmin].sort());
    assert.ok(rows.every((r) => r.audience === "admin" && r.link_url.includes(store)));
    await db.exec(sql);
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM public.notifications")).rows[0].n,
      2,
    );

    await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${owner}',false);
      INSERT INTO public.establishments(id,owner_id,nome,status)
        VALUES('${newStore}','${owner}','Nova loja','pendente'); RESET ROLE;`);
    rows = (
      await db.query(
        `SELECT user_id,audience FROM public.notifications WHERE link_url LIKE '%${newStore}%'`,
      )
    ).rows;
    assert.equal(rows.length, 2, "a real owner registration must notify every admin");
    assert.ok(rows.every((r) => r.audience === "admin" && r.user_id !== owner));
    await db.exec(
      `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    await assert.rejects(
      db.exec(`UPDATE public.establishments SET status='aprovado' WHERE id='${newStore}'`),
    );
    await db.exec("RESET ROLE;");
    assert.equal(
      (
        await db.query(
          `SELECT count(*)::int AS n FROM public.notifications WHERE audience='estabelecimento'`,
        )
      ).rows[0].n,
      0,
    );

    await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${admin}',false);
      UPDATE public.establishments SET status='aprovado',is_open=false WHERE id='${newStore}';
      UPDATE public.establishments SET status='aprovado' WHERE id='${newStore}';
      UPDATE public.establishments SET nome='Novo nome' WHERE id='${newStore}'; RESET ROLE;`);
    rows = (
      await db.query(
        "SELECT user_id,audience,titulo,link_url FROM public.notifications WHERE audience='estabelecimento'",
      )
    ).rows;
    assert.equal(
      rows.length,
      1,
      "repeated approval or unrelated edits must not repeat the owner alert",
    );
    assert.equal(rows[0].user_id, owner);
    assert.equal(rows[0].link_url, "/estabelecimento");
    assert.match(rows[0].titulo, /aprovado/i);
    const privileges = (
      await db.query(`SELECT
      has_function_privilege('authenticated','private.notify_establishment_registration()','EXECUTE') AS member,
      has_function_privilege('anon','private.notify_establishment_registration()','EXECUTE') AS visitor`)
    ).rows[0];
    assert.equal(privileges.member, false);
    assert.equal(privileges.visitor, false);

    await db.exec(
      `BEGIN; UPDATE public.establishments SET status='aprovado' WHERE id='${store}'; ROLLBACK;`,
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM public.notifications WHERE audience='estabelecimento'",
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query(`SELECT status FROM public.establishments WHERE id='${store}'`)).rows[0]
        .status,
      "pendente",
    );
  } finally {
    await db.close();
  }
});
