import test from "node:test";
import { readFile } from "node:fs/promises";
import { createCheckoutDatabase } from "../scripts/testing/checkout-database.mjs";

test("PostgreSQL migration: authoritative checkout, atomicity, access controls and reservations", async () => {
  const db = await createCheckoutDatabase();
  try {
    await db.exec(
      await readFile(new URL("../supabase/tests/checkout-integrity.sql", import.meta.url), "utf8"),
    );
    await db.exec(
      await readFile(new URL("../supabase/tests/checkout-extended.sql", import.meta.url), "utf8"),
    );
  } finally {
    await db.close();
  }
});
