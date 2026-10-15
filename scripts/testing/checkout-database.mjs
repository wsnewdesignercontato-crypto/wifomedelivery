import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const root = new URL("../../", import.meta.url);
export async function createCheckoutDatabase() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);`);
  const schema = await readFile(
    new URL("supabase/bootstrap/20261013041244_initialize_wifome_destination.sql", root),
    "utf8",
  );
  for (const m of schema.matchAll(/CREATE TYPE public\.\w+ AS ENUM \([\s\S]*?\n\);/g))
    await db.exec(m[0]);
  for (const m of schema.matchAll(/CREATE TABLE public\.\w+ \([\s\S]*?\n\);/g)) await db.exec(m[0]);
  for (const m of schema.matchAll(
    /ALTER TABLE ONLY public\.\w+\n\s+ADD CONSTRAINT [^;]*(?:PRIMARY KEY|UNIQUE)[^;]*;/g,
  ))
    await db.exec(m[0]);
  function fn(name) {
    const m = schema.match(
      new RegExp(
        "CREATE OR REPLACE FUNCTION " + name.replaceAll(".", "\\.") + "\\([\\s\\S]*?\\n\\$\\$;",
      ),
    );
    if (!m) throw Error("Missing " + name);
    return m[0];
  }
  for (const name of [
    "private.has_role",
    "private.is_courier_dispatch_approved",
    "public.auto_disable_product_on_zero_stock",
    "public.orders_status_guard",
  ])
    await db.exec(fn(name));
  await db.exec(`CREATE TRIGGER trg_auto_disable_on_zero BEFORE UPDATE OF estoque ON public.products FOR EACH ROW EXECUTE FUNCTION public.auto_disable_product_on_zero_stock();
CREATE TRIGGER orders_status_guard_trg BEFORE UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.orders_status_guard();
CREATE FUNCTION public.create_ledger_on_delivered() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER trg_create_ledger_on_delivered AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.create_ledger_on_delivered();
CREATE TRIGGER trg_ledger_on_delivered AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.create_ledger_on_delivered();
GRANT USAGE ON SCHEMA public,private,auth TO authenticated,anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER TABLE public.courier_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY courier_profiles_own ON public.courier_profiles TO authenticated USING (auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
ALTER TABLE public.establishments ENABLE ROW LEVEL SECURITY;
CREATE POLICY establishments_owner_update ON public.establishments FOR UPDATE TO authenticated USING(auth.uid()=owner_id) WITH CHECK(auth.uid()=owner_id);
CREATE POLICY establishments_public_read ON public.establishments FOR SELECT TO authenticated USING(true);
CREATE POLICY establishments_owner_insert ON public.establishments FOR INSERT TO authenticated WITH CHECK(auth.uid()=owner_id);`);
  await db.exec(
    await readFile(
      new URL("supabase/migrations/20261015203710_secure_checkout_and_profile_fields.sql", root),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL("supabase/migrations/20261015205302_enforce_checkout_write_path.sql", root),
      "utf8",
    ),
  );
  return db;
}
