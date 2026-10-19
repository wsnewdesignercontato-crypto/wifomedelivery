import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCheckoutDatabase } from "../scripts/testing/checkout-database.mjs";
test("operational push reaches approved available couriers with equivalent city spellings", async () => {
  const db = await createCheckoutDatabase();
  try {
    const catalog = await readFile(
      new URL(
        "../supabase/migrations/20261018154356_delivery_niches_and_search.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const normalize = catalog.match(
      /CREATE OR REPLACE FUNCTION public\.normalize_delivery_text[\s\S]*?\$\$;/,
    )[0];
    await db.exec(normalize);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261019013953_normalize_courier_offer_city.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      "CREATE TRIGGER city_offer AFTER INSERT OR UPDATE OF status ON public.deliveries FOR EACH ROW EXECUTE FUNCTION public.notify_couriers_new_ride()",
    );
    const ids = Array.from(
      { length: 7 },
      (_, i) => "92000000-0000-4000-8000-" + String(i + 1).padStart(12, "0"),
    );
    for (const [i, id] of ids.entries())
      await db.query("insert into auth.users(id,email) values($1,$2)", [
        id,
        "city" + i + "@example.invalid",
      ]);
    const shop = "92000000-0000-4000-8000-000000000010";
    await db.query(
      "insert into public.establishments(id,owner_id,nome,cidade) values($1,$2,'Test shop','sao sebastiao do paraiso')",
      [shop, ids[0]],
    );
    for (let i = 2; i < 7; i++)
      await db.query(
        "insert into public.courier_profiles(user_id,status,aprovacao,kyc_status,cidade_atuacao,cidades_atuacao) values($1,$2,$3,$3,$4,$5)",
        [
          ids[i],
          i === 5 ? "offline" : "online",
          i === 6 ? "pending" : "approved",
          i === 2 ? " São Sebastião do Paraíso " : "Outra cidade",
          i === 3 ? ["São Sebastião do Paraíso"] : null,
        ],
      );
    const order = (
      await db.query(
        "insert into public.orders(cliente_id,establishment_id,status,subtotal_cents,frete_cents,total_cents,forma_pagamento,tipo_entrega) values($1,$2,'placed',1000,500,1500,'pix','delivery') returning id",
        [ids[1], shop],
      )
    ).rows[0].id;
    const delivery = (
      await db.query(
        "insert into public.deliveries(order_id,status,valor_entrega_cents) values($1,'broadcasting',500) returning id",
        [order],
      )
    ).rows[0].id;
    assert.deepEqual(
      (
        await db.query(
          "select user_id from public.notifications where audience='entregador' order by user_id",
        )
      ).rows.map((x) => x.user_id),
      ids.slice(2, 4),
    );
    await db.query("update public.deliveries set status='broadcasting' where id=$1", [delivery]);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.notifications where audience='entregador'",
        )
      ).rows[0].n,
      2,
    );
  } finally {
    await db.close();
  }
});
