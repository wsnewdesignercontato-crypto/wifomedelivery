import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCheckoutDatabase } from "../scripts/testing/checkout-database.mjs";

test("payment simulator rejects non-admins, isolates receipts and cleans only test orders", async () => {
  const db = await createCheckoutDatabase();
  const load = (p) => readFile(new URL("../" + p, import.meta.url), "utf8");
  try {
    await db.exec(await load("supabase/migrations/20261016025222_audit_checkout_finance.sql"));
    await db.exec(`CREATE FUNCTION public.trg_orders_delay_penalty() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test affected real score'; END $$;
      CREATE TRIGGER trg_orders_delay_score AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_orders_delay_penalty();`);
    const normalize = (
      await load("supabase/migrations/20261018154356_delivery_niches_and_search.sql")
    ).match(/CREATE OR REPLACE FUNCTION public\.normalize_delivery_text[\s\S]*?\$\$;/)[0];
    await db.exec(normalize);
    await db.exec(await load("supabase/migrations/20261019031549_admin_payment_simulator.sql"));
    const admin = "93000000-0000-4000-8000-000000000001",
      customer = "93000000-0000-4000-8000-000000000002",
      shop = "93000000-0000-4000-8000-000000000003";
    for (const [id, name] of [
      [admin, "Simulator admin"],
      [customer, "Simulator customer"],
    ]) {
      await db.query("INSERT INTO auth.users(id,email) VALUES($1,$2)", [
        id,
        id + "@example.invalid",
      ]);
      await db.query("INSERT INTO public.profiles(id,nome) VALUES($1,$2)", [id, name]);
    }
    await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin')", [admin]);
    await db.query(
      "INSERT INTO public.establishments(id,owner_id,nome,status,is_open,cidade,taxa_entrega_cents) VALUES($1,$2,'Simulator shop','aprovado',true,'Test city',500)",
      [shop, admin],
    );
    async function user(id) {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
    }
    async function command(action, payload = {}) {
      return (
        await db.query("SELECT public.admin_payment_test($1,$2::jsonb) AS data", [
          action,
          JSON.stringify(payload),
        ])
      ).rows[0].data;
    }
    await user(customer);
    await assert.rejects(command("state"), /Admin only/);
    await user(admin);
    assert.equal((await command("state")).enabled, false);
    const payload = {
      request_key: "93000000-0000-4000-8000-000000000004",
      store_id: shop,
      customer_id: customer,
      fulfillment: "pickup",
      payment_method: "pix",
      subtotal_cents: 1000,
    };
    await assert.rejects(command("create", payload), /Ative o modo/);
    await command("toggle", { enabled: true });
    let state = await command("create", payload);
    const sale = state.sales[0].id;
    assert.equal(state.count, 1);
    assert.equal((await command("create", payload)).count, 1);
    state = await command("approve", { sale_id: sale });
    const order = state.sales[0].order_id;
    await command("approve", { sale_id: sale });
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM public.orders WHERE is_test")).rows[0].n,
      1,
    );
    await assert.rejects(
      db.query("UPDATE public.orders SET test_sale_id=NULL WHERE id=$1", [order]),
      /immutable/,
    );
    // An ordinary order remains as a sentinel for cleanup and ledger isolation.
    await user("");
    const real = (
      await db.query(
        "INSERT INTO public.orders(cliente_id,establishment_id,status,subtotal_cents,frete_cents,total_cents,forma_pagamento,tipo_entrega) VALUES($1,$2,'placed',1000,0,1000,'pix','pickup') RETURNING id",
        [customer, shop],
      )
    ).rows[0].id;
    await user(admin);
    for (const status of ["accepted", "preparing", "ready", "delivered"])
      await db.query("UPDATE public.orders SET status=$1 WHERE id=$2", [status, order]);
    assert.equal(
      (
        await db.query("SELECT count(*)::int AS n FROM public.platform_ledger WHERE order_id=$1", [
          order,
        ])
      ).rows[0].n,
      0,
    );
    await assert.rejects(
      db.query("SELECT public.settle_order_payment($1,'test-receipt')", [order]),
      /cannot become real receipts/,
    );
    await command("refund", { sale_id: sale });
    state = await command("create", {
      ...payload,
      request_key: "93000000-0000-4000-8000-000000000005",
      subtotal_cents: 2000,
    });
    const refused = state.sales.find((s) => s.subtotal_cents === 2000).id;
    state = await command("decline", { sale_id: refused });
    assert.equal(state.sales.find((s) => s.id === refused).order_id, null);
    await command("toggle", { enabled: false });
    await assert.rejects(command("cleanup"), /Confirme/);
    state = await command("cleanup", { confirmation: "LIMPAR TESTES" });
    assert.equal(state.count, 0);
    assert.equal(state.enabled, false);
    assert.equal(
      (
        await db.query("SELECT count(*)::int AS n FROM public.orders WHERE id=$1 AND NOT is_test", [
          real,
        ])
      ).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM public.orders WHERE is_test")).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
