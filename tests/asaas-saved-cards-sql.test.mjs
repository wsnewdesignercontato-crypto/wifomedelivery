import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPaymentDatabase } from "./helpers/payment-database.mjs";

test("saved-card SQL isolates owners, environments and revisions and denies browser roles", async () => {
  const db = await createPaymentDatabase();
  try {
    // PGlite does not include Supabase Vault/pgcrypto. Emulate their SQL API only;
    // actual encryption at rest must also be verified against hosted Vault.
    await db.exec(`
      ALTER TABLE auth.users ADD COLUMN deleted_at timestamptz, ADD COLUMN banned_until timestamptz;
      CREATE SCHEMA extensions;
      CREATE FUNCTION extensions.digest(value text,algorithm text) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$ SELECT sha256(convert_to(value,'UTF8')) $$;
      CREATE OR REPLACE VIEW vault.decrypted_secrets AS SELECT id,convert_from(decode(substring(secret FROM 6),'base64'),'UTF8') COLLATE "default" AS decrypted_secret FROM vault.secrets;
      CREATE OR REPLACE FUNCTION vault.create_secret(new_secret text,new_name text DEFAULT NULL,new_description text DEFAULT '') RETURNS uuid LANGUAGE plpgsql AS $$
        DECLARE result uuid; BEGIN INSERT INTO vault.secrets(secret,name,description) VALUES('stub:'||encode(convert_to(new_secret,'UTF8'),'base64'),new_name,new_description) RETURNING id INTO result; RETURN result; END $$;
      GRANT USAGE ON SCHEMA auth,vault,extensions TO service_role;
      GRANT SELECT,INSERT,DELETE ON vault.secrets TO service_role;
      GRANT SELECT ON vault.decrypted_secrets TO service_role;
    `);
    const migration = await readFile(
      new URL("../supabase/migrations/20261020045703_asaas_saved_cards.sql", import.meta.url),
      "utf8",
    );
    const contract = await readFile(
      new URL("../supabase/tests/asaas-saved-cards.sql", import.meta.url),
      "utf8",
    );
    await db.exec(
      "BEGIN;\n" +
        migration +
        "\n" +
        contract.replace(/^BEGIN;\s*$/m, "").replace(/^ROLLBACK;\s*$/m, "") +
        "\nROLLBACK;",
    );
    assert.equal(
      (await db.query("SELECT to_regclass('asaas_private.saved_cards') AS saved_cards")).rows[0]
        .saved_cards,
      null,
    );
  } finally {
    await db.close();
  }
});
