import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

export async function createAppInstallDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
    INSERT INTO auth.users VALUES
      ('10000000-0000-4000-8000-000000000001'),
      ('10000000-0000-4000-8000-000000000002');
  `);
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261017130815_record_user_app_installs.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  return db;
}
