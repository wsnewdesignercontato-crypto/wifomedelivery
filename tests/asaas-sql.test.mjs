import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("PostgreSQL Asaas configuration isolates environments, secrets, revisions and webhook metadata", async () => {
  const db = new PGlite();
  try {
    // Vault is an extension unavailable inside PGlite. Its narrow SQL contract
    // is stubbed here; the same contract runs against real Vault with rollback.
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA vault;
      CREATE TABLE vault.secrets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),secret text NOT NULL,name text UNIQUE,description text);
      CREATE VIEW vault.decrypted_secrets AS SELECT id,convert_from(decode(substring(secret FROM 6),'base64'),'UTF8') AS decrypted_secret FROM vault.secrets;
      CREATE FUNCTION vault.create_secret(new_secret text,new_name text DEFAULT NULL,new_description text DEFAULT '') RETURNS uuid LANGUAGE plpgsql AS $$
      DECLARE result uuid; BEGIN INSERT INTO vault.secrets(secret,name,description) VALUES('stub:'||encode(convert_to(new_secret,'UTF8'),'base64'),new_name,new_description) RETURNING id INTO result; RETURN result; END $$;
      CREATE FUNCTION vault.update_secret(secret_id uuid,new_secret text DEFAULT NULL,new_name text DEFAULT NULL,new_description text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
      UPDATE vault.secrets SET secret=coalesce('stub:'||encode(convert_to(new_secret,'UTF8'),'base64'),secret),name=coalesce(new_name,name),description=coalesce(new_description,description) WHERE id=secret_id $$;`);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261019025335_asaas_admin_configuration.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(await readFile(new URL("../supabase/tests/asaas.sql", import.meta.url), "utf8"));
  } finally {
    await db.close();
  }
});
