import { readFile } from "node:fs/promises";
import { createCheckoutDatabase } from "../../scripts/testing/checkout-database.mjs";
const root = new URL("../../", import.meta.url);
export async function createPaymentDatabase() {
  const db = await createCheckoutDatabase();
  const read = (path) => readFile(new URL(path, root), "utf8");
  try {
    await db.exec(await read("supabase/migrations/20261016025222_audit_checkout_finance.sql"));
    await db.exec(await read("supabase/migrations/20261016025225_pwa_guest_checkout.sql"));
    await db.exec(`CREATE SCHEMA vault;
    CREATE TABLE vault.secrets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),secret text,name text UNIQUE,description text);
    CREATE VIEW vault.decrypted_secrets AS SELECT id,secret AS decrypted_secret FROM vault.secrets;
    CREATE FUNCTION vault.create_secret(new_secret text,new_name text DEFAULT NULL,new_description text DEFAULT '') RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE result uuid; BEGIN INSERT INTO vault.secrets(secret,name,description) VALUES(new_secret,new_name,new_description) RETURNING id INTO result; RETURN result; END $$;
    CREATE FUNCTION vault.update_secret(secret_id uuid,new_secret text DEFAULT NULL,new_name text DEFAULT NULL,new_description text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$ UPDATE vault.secrets SET secret=coalesce(new_secret,secret),name=coalesce(new_name,name),description=coalesce(new_description,description) WHERE id=secret_id $$;
    `);
    await db.exec(await read("supabase/migrations/20261019025335_asaas_admin_configuration.sql"));
    const deadline = await read("supabase/migrations/20261018201942_order_acceptance_deadline.sql");
    await db.exec(deadline.split("CREATE EXTENSION IF NOT EXISTS pg_cron")[0]);
    const notify = await read(
      "supabase/migrations/20260801164309_7528cbf4-b282-426d-a2a3-575de2401257.sql",
    );
    await db.exec(notify);
    await db.exec(
      `CREATE FUNCTION public.trg_orders_delay_penalty() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$; CREATE TRIGGER trg_orders_delay_score AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_orders_delay_penalty();`,
    );
    const normalize = (
      await read("supabase/migrations/20261018154356_delivery_niches_and_search.sql")
    ).match(/CREATE OR REPLACE FUNCTION public\.normalize_delivery_text[\s\S]*?\$\$;/)[0];
    await db.exec(normalize);
    await db.exec(await read("supabase/migrations/20261019031549_admin_payment_simulator.sql"));
    await db.exec(
      await read(
        "supabase/migrations/20261019035427_realistic_checkout_test_and_notification_inbox.sql",
      ),
    );
    await db.exec(await read("supabase/migrations/20261019172448_asaas_transparent_payments.sql"));
    await db.exec("GRANT SELECT ON public.orders TO service_role");
    await db.exec((await read("supabase/migrations/20261019173636_asaas_payment_reconciliation.sql")).split("-- Hosted scheduling;")[0]);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
