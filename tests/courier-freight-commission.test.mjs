import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPaymentDatabase } from "./helpers/payment-database.mjs";
const id = (n) => `cc000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1),
  owner = id(2),
  client = id(3),
  courier = id(4),
  store = id(5),
  legacy = id(6);
let db;
const read = (name) => readFile(new URL("../supabase/migrations/" + name, import.meta.url), "utf8");
async function order(n, freight = 1000, kind = "delivery") {
  await db.exec(
    `RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false); INSERT INTO public.orders(id,cliente_id,establishment_id,status,subtotal_cents,frete_cents,total_cents,commission_cents,tipo_entrega) VALUES('${id(n)}','${client}','${store}','ready',10000,${freight},${10000 + freight},800,'${kind}')`,
  );
  return id(n);
}
test.before(async () => {
  db = await createPaymentDatabase();
  for (const name of [
    "20261019231556_payment_test_safe_cleanup.sql",
    "20261019232859_admin_generate_test_order.sql",
    "20261020032842_admin_generate_direct_test_ride.sql",
  ])
    await db.exec(await read(name));
  await db.exec(await read("20261018192423_atomic_delivery_workflow.sql"));
  await db.exec(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('${admin}','freight-admin@example.invalid',now()),('${owner}','freight-store@example.invalid',now()),('${client}','freight-client@example.invalid',now()),('${courier}','freight-courier@example.invalid',now());
    INSERT INTO public.user_roles(user_id,role) VALUES('${admin}','admin');
    INSERT INTO public.platform_settings(id,commission_pct) VALUES(1,8);
    INSERT INTO public.establishments(id,owner_id,nome,status,is_open) VALUES('${store}','${owner}','Freight fixture','aprovado',true);
    INSERT INTO public.courier_profiles(user_id,status,aprovacao,kyc_status) VALUES('${courier}','online','approved','approved');`);
  await order(6);
  await db.exec(await read("20261024003756_courier_freight_commission.sql"));
});
test.after(async () => {
  if (db) await db.close();
});
test("new freight is split once into 92 percent courier payout and 8 percent platform fee", async () => {
  const oid = await order(7);
  assert.deepEqual(
    (
      await db.query(
        `SELECT courier_commission_cents,courier_commission_pct::float8 AS pct FROM public.orders WHERE id='${oid}'`,
      )
    ).rows[0],
    { courier_commission_cents: 80, pct: 8 },
  );
  await db.exec(
    `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${owner}',false)`,
  );
  await db.query("SELECT public.dispatch_order_delivery($1,9999,NULL)", [oid]);
  await db.query("SELECT public.dispatch_order_delivery($1,1,NULL)", [oid]);
  await db.exec("RESET ROLE");
  const delivery = (
    await db.query(`SELECT valor_entrega_cents FROM public.deliveries WHERE order_id='${oid}'`)
  ).rows;
  assert.equal(delivery.length, 1);
  assert.equal(delivery[0].valor_entrega_cents, 920);
  await db.exec(
    `UPDATE public.deliveries SET status='cancelled' WHERE order_id='${oid}'; SELECT set_config('request.jwt.claim.sub','${owner}',false); SET ROLE authenticated`,
  );
  await db.query("SELECT public.dispatch_order_delivery($1,9999,NULL)", [oid]);
  await db.exec("RESET ROLE");
  assert.equal(
    (await db.query(`SELECT valor_entrega_cents FROM public.deliveries WHERE order_id='${oid}'`))
      .rows[0].valor_entrega_cents,
    920,
  );
  await db.exec(
    `SELECT set_config('request.jwt.claim.sub','',false); UPDATE public.deliveries SET entregador_id='${courier}' WHERE order_id='${oid}'`,
  );
  for (const status of ["courier_assigned", "picked_up", "on_the_way", "delivered"])
    await db.exec(`UPDATE public.orders SET status='${status}' WHERE id='${oid}'`);
  const row = (
    await db.query(
      `SELECT gross_cents,commission_cents,courier_commission_cents,courier_payout_cents,merchant_payout_cents,platform_revenue_cents,status FROM public.platform_ledger WHERE order_id='${oid}'`,
    )
  ).rows[0];
  assert.deepEqual(row, {
    gross_cents: 11000,
    commission_cents: 800,
    courier_commission_cents: 80,
    courier_payout_cents: 920,
    merchant_payout_cents: 9200,
    platform_revenue_cents: 880,
    status: "pending",
  });
  await db.exec(`UPDATE public.orders SET status='refunded' WHERE id='${oid}'`);
  assert.equal(
    (await db.query(`SELECT status FROM public.platform_ledger WHERE order_id='${oid}'`)).rows[0]
      .status,
    "reversed",
  );
});
test("existing orders retain the full freight even when dispatched after the new policy", async () => {
  await db.exec(
    `RESET ROLE; SELECT set_config('request.jwt.claim.sub','${owner}',false); SET ROLE authenticated`,
  );
  await db.query("SELECT public.dispatch_order_delivery($1,1,NULL)", [legacy]);
  await db.exec("RESET ROLE");
  assert.equal(
    (await db.query(`SELECT valor_entrega_cents FROM public.deliveries WHERE order_id='${legacy}'`))
      .rows[0].valor_entrega_cents,
    1000,
  );
});
test("snapshot rounding conserves cents and changes of rate never reprice existing orders", async () => {
  const oid = await order(8, 999);
  assert.equal(
    (await db.query(`SELECT courier_commission_cents FROM public.orders WHERE id='${oid}'`)).rows[0]
      .courier_commission_cents,
    80,
  );
  await db.exec(`UPDATE public.platform_settings SET courier_commission_pct=10 WHERE id=1`);
  await db.exec(
    `UPDATE public.orders SET observacoes='unchanged financial snapshot' WHERE id='${oid}'`,
  );
  assert.equal(
    (await db.query(`SELECT courier_commission_cents FROM public.orders WHERE id='${oid}'`)).rows[0]
      .courier_commission_cents,
    80,
  );
  await assert.rejects(
    db.exec(`UPDATE public.orders SET courier_commission_cents=0 WHERE id='${oid}'`),
    /immutable/,
  );
  await db.exec(`UPDATE public.platform_settings SET courier_commission_pct=8 WHERE id=1`);
});
test("pickup and zero freight retain zero; a forged INSERT cannot choose the fee", async () => {
  const pickup = await order(9, 0, "pickup"),
    free = await order(10, 0);
  assert.equal(
    (
      await db.query(
        `SELECT sum(courier_commission_cents)::int n FROM public.orders WHERE id IN('${pickup}','${free}')`,
      )
    ).rows[0].n,
    0,
  );
  await db.exec(
    `INSERT INTO public.orders(id,cliente_id,establishment_id,status,subtotal_cents,frete_cents,total_cents,courier_commission_cents) VALUES('${id(11)}','${client}','${store}','ready',10000,1000,11000,0)`,
  );
  assert.equal(
    (await db.query(`SELECT courier_commission_cents FROM public.orders WHERE id='${id(11)}'`))
      .rows[0].courier_commission_cents,
    80,
  );
});

test("a merchant-funded discount reduces only the merchant share and the split still conserves the customer total", async () => {
  await db.exec(
    `RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false); INSERT INTO public.orders(id,cliente_id,establishment_id,status,subtotal_cents,frete_cents,desconto_cents,total_cents,commission_cents,tipo_entrega,coupon_funder,discount_funder) VALUES('${id(12)}','${client}','${store}','ready',10000,1000,1500,9500,800,'delivery','merchant','establishment')`,
  );
  for (const status of [
    "waiting_courier",
    "courier_assigned",
    "picked_up",
    "on_the_way",
    "delivered",
  ])
    await db.exec(`UPDATE public.orders SET status='${status}' WHERE id='${id(12)}'`);
  const row = (
    await db.query(
      `SELECT merchant_payout_cents AS merchant,courier_payout_cents AS courier,platform_revenue_cents AS platform,gross_cents AS total FROM public.platform_ledger WHERE order_id='${id(12)}'`,
    )
  ).rows[0];
  assert.deepEqual(row, { merchant: 7700, courier: 920, platform: 880, total: 9500 });
});

test("the admin direct test ride and simulator report the same net freight without a real ledger entry", async () => {
  for (const person of [admin, owner, client, courier])
    await db.query(
      "INSERT INTO public.profiles(id,nome) VALUES($1,'Freight fixture') ON CONFLICT(id) DO NOTHING",
      [person],
    );
  await db.exec(
    `UPDATE public.establishments SET cidade='Test city',taxa_entrega_cents=1000 WHERE id='${store}'; UPDATE public.courier_profiles SET cidade_atuacao='Test city',status='online' WHERE user_id='${courier}'; INSERT INTO public.addresses(user_id,rua,cidade,is_default) VALUES('${client}','Fixture street','Test city',true); SELECT set_config('request.jwt.claim.sub','${admin}',false);`,
  );
  await db.query(`SELECT public.admin_payment_test('toggle','{"enabled":true}')`);
  const state = (
    await db.query("SELECT public.admin_generate_test_ride($1,$2,$3,$4,10000) AS data", [
      id(13),
      client,
      store,
      courier,
    ])
  ).rows[0].data;
  const sale = state.sales[0];
  assert.equal(sale.courier_commission_cents, 80);
  assert.equal(
    (
      await db.query("SELECT valor_entrega_cents FROM public.deliveries WHERE order_id=$1", [
        sale.order_id,
      ])
    ).rows[0].valor_entrega_cents,
    920,
  );
  assert.equal(
    (
      await db.query("SELECT count(*)::int n FROM public.platform_ledger WHERE order_id=$1", [
        sale.order_id,
      ])
    ).rows[0].n,
    0,
  );
});
