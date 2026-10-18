import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCheckoutDatabase } from "../scripts/testing/checkout-database.mjs";
import { acceptanceSecondsRemaining, pendingOrderStillOpen } from "../src/lib/order-acceptance.ts";
const migration = new URL(
  "../supabase/migrations/20261018201942_order_acceptance_deadline.sql",
  import.meta.url,
);
test("acceptance countdown has exact boundaries and preserves legacy orders without a deadline", () => {
  const now = Date.parse("2026-10-18T20:00:00Z");
  assert.equal(acceptanceSecondsRemaining("2026-10-18T20:01:00Z", now), 60);
  assert.equal(acceptanceSecondsRemaining("2026-10-18T20:00:00Z", now), 0);
  assert.equal(acceptanceSecondsRemaining("invalid", now), null);
  assert.equal(pendingOrderStillOpen({ status: "placed", acceptance_deadline: null }, now), true);
  assert.equal(
    pendingOrderStillOpen({ status: "accepted", acceptance_deadline: "2026-10-18T20:01:00Z" }, now),
    false,
  );
  assert.equal(
    pendingOrderStillOpen({ status: "placed", acceptance_deadline: "2026-10-18T20:00:00Z" }, now),
    false,
  );
});
test("server deadlines are immutable, expiry is idempotent and accepted orders never expire", async () => {
  const db = await createCheckoutDatabase();
  try {
    const sql = (await readFile(migration, "utf8")).split(
      "CREATE EXTENSION IF NOT EXISTS pg_cron",
    )[0];
    await db.exec(sql);
    await db.exec(
      "CREATE TRIGGER test_notify_order_status AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.notify_client_on_status()",
    );
    const owner = "91000000-0000-4000-8000-000000000001",
      customer = "91000000-0000-4000-8000-000000000002",
      shop = "91000000-0000-4000-8000-000000000003";
    await db.query(
      "insert into auth.users(id,email) values($1,'owner@example.invalid'),($2,'customer@example.invalid')",
      [owner, customer],
    );
    await db.query(
      "insert into public.establishments(id,owner_id,nome) values($1,$2,'Test shop')",
      [shop, owner],
    );
    const make = async () =>
      (
        await db.query(
          "insert into public.orders(cliente_id,establishment_id,status,subtotal_cents,frete_cents,total_cents,forma_pagamento,tipo_entrega) values($1,$2,'placed',1000,500,1500,'pix','delivery') returning id,acceptance_deadline",
          [customer, shop],
        )
      ).rows[0];
    const order = await make();
    assert.ok(Date.parse(order.acceptance_deadline) > Date.now() + 50000);
    await assert.rejects(
      db.query("update public.orders set acceptance_deadline=null where id=$1", [order.id]),
      /controlado pelo servidor/,
    );
    assert.equal(
      (await db.query("select private.expire_unaccepted_order($1) as expired", [order.id])).rows[0]
        .expired,
      false,
    );
    const later = new Date(Date.now() + 120000).toISOString();
    assert.equal(
      (
        await db.query("select private.expire_unaccepted_order($1,$2::timestamptz) as expired", [
          order.id,
          later,
        ])
      ).rows[0].expired,
      true,
    );
    assert.equal(
      (
        await db.query("select private.expire_unaccepted_order($1,$2::timestamptz) as expired", [
          order.id,
          later,
        ])
      ).rows[0].expired,
      false,
    );
    const saved = (
      await db.query(
        "select status,cancellation_reason,cancelled_role from public.orders where id=$1",
        [order.id],
      )
    ).rows[0];
    assert.equal(saved.status, "cancelled");
    assert.equal(saved.cancelled_role, "sistema");
    assert.match(saved.cancellation_reason, /não respondeu/);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.notifications where user_id=$1 and mensagem like '%não respondeu%'",
          [customer],
        )
      ).rows[0].n,
      1,
    );
    const accepted = await make();
    await db.query("update public.orders set status='accepted' where id=$1", [accepted.id]);
    assert.equal(
      (
        await db.query("select private.expire_unaccepted_order($1,$2::timestamptz) as expired", [
          accepted.id,
          later,
        ])
      ).rows[0].expired,
      false,
    );

    const late = await make();
    await db.exec("ALTER TABLE public.orders DISABLE TRIGGER audit_order_acceptance_deadline");
    await db.query(
      "update public.orders set acceptance_deadline=now()-interval '1 second' where id=$1",
      [late.id],
    );
    await db.exec("ALTER TABLE public.orders ENABLE TRIGGER audit_order_acceptance_deadline");
    await assert.rejects(
      db.query("update public.orders set status='accepted' where id=$1", [late.id]),
      /prazo.*expirou/i,
    );
    const couriers = [
      "91000000-0000-4000-8000-000000000010",
      "91000000-0000-4000-8000-000000000011",
      "91000000-0000-4000-8000-000000000012",
      "91000000-0000-4000-8000-000000000013",
      "91000000-0000-4000-8000-000000000014",
    ];
    await db.query("update public.establishments set cidade='Test city' where id=$1", [shop]);
    for (let i = 0; i < couriers.length; i++) {
      await db.query("insert into auth.users(id,email) values($1,$2)", [
        couriers[i],
        "courier" + i + "@example.invalid",
      ]);
      await db.query(
        "insert into public.courier_profiles(user_id,status,aprovacao,kyc_status,cidade_atuacao) values($1,$2,$3,$3,$4)",
        [
          couriers[i],
          i === 3 ? "offline" : "online",
          i === 2 ? "pending" : "approved",
          i === 4 ? "Other city" : "Test city",
        ],
      );
    }
    const rideOrder = await make();
    const ride = (
      await db.query(
        "insert into public.deliveries(order_id,status,valor_entrega_cents) values($1,'broadcasting',500) returning id",
        [rideOrder.id],
      )
    ).rows[0];
    const recipients = (
      await db.query(
        "select user_id from public.notifications where audience='entregador' order by user_id",
      )
    ).rows.map((x) => x.user_id);
    assert.deepEqual(recipients, couriers.slice(0, 2));
    await db.query("update public.deliveries set status='broadcasting' where id=$1", [ride.id]);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.notifications where audience='entregador'",
        )
      ).rows[0].n,
      2,
    );
    await db.exec("set role authenticated");
    await assert.rejects(
      db.query("select private.expire_unaccepted_order($1,$2::timestamptz)", [accepted.id, later]),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select private.expire_unaccepted_orders()"),
      /permission denied/,
    );
    await db.exec("reset role");
  } finally {
    await db.close();
  }
});
