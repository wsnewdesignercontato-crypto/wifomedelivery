import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Breaks caught: filtering after LIMIT, counting a single page, leaking deleted
// accounts, and bypassing the current administrator's account/role checks.
const db = new PGlite();
await db.exec(`
  CREATE SCHEMA auth; CREATE SCHEMA private;
  CREATE ROLE anon; CREATE ROLE authenticated;
  CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,created_at timestamptz,
    last_sign_in_at timestamptz,email_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz);
  CREATE TABLE public.user_roles(user_id uuid,role text);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  CREATE FUNCTION private.has_role(uid uuid,r text) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT FROM public.user_roles WHERE user_id=uid AND role=r) $$;
  CREATE FUNCTION private.current_account_is_active() RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT FROM auth.users WHERE id=auth.uid() AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=now())) $$;
  INSERT INTO auth.users(id,email,created_at,email_confirmed_at,banned_until,deleted_at) VALUES
  ('10000000-0000-4000-8000-000000000001','admin@example.invalid','2026-10-01',now(),NULL,NULL),
  ('10000000-0000-4000-8000-000000000002','dual@example.invalid','2026-10-02',now(),NULL,NULL),
  ('10000000-0000-4000-8000-000000000003','blocked@example.invalid','2026-10-03',now(),now()+interval '1 day',NULL),
  ('10000000-0000-4000-8000-000000000004','pending@example.invalid','2026-10-04',NULL,NULL,NULL),
  ('10000000-0000-4000-8000-000000000005','deleted@example.invalid','2026-10-05',now(),NULL,now());
  INSERT INTO public.user_roles VALUES
  ('10000000-0000-4000-8000-000000000001','admin'),
  ('10000000-0000-4000-8000-000000000002','cliente'),
  ('10000000-0000-4000-8000-000000000002','estabelecimento'),
  ('10000000-0000-4000-8000-000000000003','entregador'),
  ('10000000-0000-4000-8000-000000000004','cliente'),
  ('10000000-0000-4000-8000-000000000005','cliente');
`);
await db.exec(
  await readFile(
    new URL("../supabase/migrations/20261019224229_admin_users_directory.sql", import.meta.url),
    "utf8",
  ),
);
const actor = (suffix) =>
  db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
    suffix ? `10000000-0000-4000-8000-${suffix.padStart(12, "0")}` : "",
  ]);
const list = async (search = "", page = 1, role = "all", status = "all", size = 1) =>
  (
    await db.query("SELECT public.admin_users_directory($1,$2,$3,$4,$5) result", [
      search,
      page,
      size,
      role,
      status,
    ])
  ).rows[0].result;

test("directory filters roles and status before pagination and clamps pages after deletions", async () => {
  await actor("1");
  const result = await list("", 99, "estabelecimento", "active");
  assert.equal(result.total, 1);
  assert.equal(result.page, 1);
  assert.deepEqual(
    result.users.map((u) => u.email),
    ["dual@example.invalid"],
  );
  assert.equal((await list("", 1, "cliente", "pending")).users[0].email, "pending@example.invalid");
  assert.equal(
    (await list("", 1, "entregador", "blocked")).users[0].email,
    "blocked@example.invalid",
  );
});
test("summary counts every nondeleted account once, preserving overlapping profiles", async () => {
  await actor("1");
  const result = await list(" DUAL ");
  assert.equal(result.total, 1);
  assert.deepEqual(result.summary, {
    total: 4,
    active: 2,
    pending: 1,
    blocked: 1,
    cliente: 2,
    estabelecimento: 1,
    entregador: 1,
    admin: 1,
  });
  assert.equal((await list("deleted")).total, 0);
  assert.equal((await list("%_'")).total, 0);
});
test("directory refuses anonymous, nonadmin, and blocked administrators", async () => {
  for (const suffix of ["", "2"]) {
    await actor(suffix);
    await assert.rejects(list(), /Admin only/);
  }
  await db.exec(
    "INSERT INTO public.user_roles VALUES('10000000-0000-4000-8000-000000000003','admin')",
  );
  await actor("3");
  await assert.rejects(list(), /Admin only/);
  assert.equal(
    (
      await db.query(
        "SELECT has_function_privilege('anon','public.admin_users_directory(text,integer,integer,text,text)','EXECUTE') allowed",
      )
    ).rows[0].allowed,
    false,
  );
});
test("invalid filters and page sizes fail rather than returning misleading counts", async () => {
  await actor("1");
  await assert.rejects(list("", 1, "unknown"), /Invalid directory filters/);
  await assert.rejects(list("", 0), /Invalid directory filters/);
  await assert.rejects(list("", 1, "all", "all", 101), /Invalid directory filters/);
});
test.after(() => db.close());
