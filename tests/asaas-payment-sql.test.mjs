import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPaymentDatabase } from "./helpers/payment-database.mjs";
test("online payment SQL preserves reservations, authentication, leases, financial confirmation and event idempotence", async () => {
  const db = await createPaymentDatabase();
  try {
    await db.exec(
      await readFile(new URL("../supabase/tests/asaas-payments.sql", import.meta.url), "utf8"),
    );
  } catch (error) {
    throw new Error(error.message);
  } finally {
    await db.close();
  }
});
