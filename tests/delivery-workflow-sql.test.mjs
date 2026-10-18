import test from "node:test";
import { readFile } from "node:fs/promises";
import { createCheckoutDatabase } from "../scripts/testing/checkout-database.mjs";

test("PostgreSQL delivery commands: atomic rollback, authorization, assignment and ordered progress", async () => {
  const db = await createCheckoutDatabase();
  try {
    // Exercise the production audit guards as well as the real order status trigger.
    const audit = await readFile(
      new URL("../supabase/migrations/20261016025220_audit_access_controls.sql", import.meta.url),
      "utf8",
    );
    for (const name of ["guard_order_proof", "guard_delivery_write"]) {
      const fn = audit.match(
        new RegExp(`CREATE OR REPLACE FUNCTION private\\.${name}\\([\\s\\S]*?END \\$\\$;`),
      );
      if (!fn) throw Error(`Missing audit function ${name}`);
      await db.exec(fn[0]);
      await db.exec(
        `CREATE TRIGGER audit_${name} BEFORE UPDATE ON public.${name === "guard_order_proof" ? "orders" : "deliveries"} FOR EACH ROW EXECUTE FUNCTION private.${name}();`,
      );
    }
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261018192423_atomic_delivery_workflow.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(new URL("../supabase/tests/delivery-workflow.sql", import.meta.url), "utf8"),
    );
  } finally {
    await db.close();
  }
});
