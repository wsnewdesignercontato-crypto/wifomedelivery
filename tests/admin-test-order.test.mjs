import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPaymentDatabase } from "./helpers/payment-database.mjs";

test("admin generator creates one approved test order atomically and protects real funds", async () => {
  const db = await createPaymentDatabase();
  try {
    for (const name of [
      "20261019231556_payment_test_safe_cleanup",
      "20261019232859_admin_generate_test_order",
      "20261020032842_admin_generate_direct_test_ride",
    ])
      await db.exec(
        await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8"),
      );
    const admin = "94000000-0000-4000-8000-000000000001";
    const customer = "94000000-0000-4000-8000-000000000002";
    const courier = "94000000-0000-4000-8000-000000000003";
    const store = "94000000-0000-4000-8000-000000000004";
    const key = "94000000-0000-4000-8000-000000000005";
    for (const id of [admin, customer, courier]) {
      await db.query("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,now())", [
        id,
        id + "@example.invalid",
      ]);
      await db.query("INSERT INTO public.profiles(id,nome) VALUES($1,'Generator fixture')", [id]);
    }
    await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin')", [admin]);
    await db.query(
      "INSERT INTO public.establishments(id,owner_id,nome,status,is_open,cidade,taxa_entrega_cents) VALUES($1,$2,'Generator fixture','aprovado',true,'Test city',500)",
      [store, admin],
    );
    await db.query(
      "INSERT INTO public.courier_profiles(user_id,status,aprovacao,kyc_status,cidade_atuacao) VALUES($1,'online','approved','approved','Test city')",
      [courier],
    );
    const user = (id) => db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
    const generate = (request = key, driver = courier, amount = 2900) =>
      db
        .query("SELECT public.admin_generate_test_order($1,$2,$3,$4,$5) AS data", [
          request,
          customer,
          store,
          driver,
          amount,
        ])
        .then((r) => r.rows[0].data);
    await user(customer);
    await assert.rejects(generate(), /Admin only/);
    await user(admin);
    await assert.rejects(generate(), /Ative o modo/);
    await db.query("SELECT public.admin_payment_test('toggle','{\"enabled\":true}')");
    await assert.rejects(generate(), /endereço/i);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM private.payment_test_sales")).rows[0].n,
      0,
    );
    await db.query(
      "INSERT INTO public.addresses(user_id,rua,cidade,is_default) VALUES($1,'Other street','Test city',false),($1,'Default street','Test city',true)",
      [customer],
    );
    await db.query("UPDATE public.courier_profiles SET status='offline' WHERE user_id=$1", [
      courier,
    ]);
    await assert.rejects(generate(), /online/);
    await db.query("UPDATE public.courier_profiles SET status='online' WHERE user_id=$1", [
      courier,
    ]);
    await assert.rejects(generate(key, courier, 99), /valor/i);
    const state = await generate();
    assert.equal(state.count, 1);
    assert.equal(state.sales[0].status, "approved");
    assert.equal(state.sales[0].order_status, "placed");
    assert.equal((await generate()).count, 1);
    await assert.rejects(generate(key, courier, 3000), /outros dados/);
    const order = (
      await db.query("SELECT * FROM public.orders WHERE id=$1", [state.sales[0].order_id])
    ).rows[0];
    assert.equal(order.is_test, true);
    assert.equal(order.total_cents, 3400);
    assert.equal(order.endereco_entrega.rua, "Default street");
    const notifications = (
      await db.query(
        "SELECT titulo,test_sale_id FROM public.notifications WHERE user_id=$1 AND audience='estabelecimento'",
        [admin],
      )
    ).rows;
    assert.equal(notifications.length, 1);
    assert.equal(
      notifications[0].test_sale_id,
      order.test_sale_id,
      "store notification must remain linked to the simulated sale",
    );
    assert.match(notifications[0].titulo, /TESTE/);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM public.deliveries")).rows[0].n,
      0,
      "ride waits for the store to prepare the order",
    );
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM public.platform_ledger")).rows[0].n,
      0,
    );
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM asaas_private.payment_attempts")).rows[0].n,
      0,
    );
    const rideKey = "94000000-0000-4000-8000-000000000020";
    const ride = (request = rideKey, driver = courier) =>
      db
        .query("SELECT public.admin_generate_test_ride($1,$2,$3,$4,2900) AS data", [
          request,
          customer,
          store,
          driver,
        ])
        .then((r) => r.rows[0].data);
    await user(customer);
    await assert.rejects(ride(), /Admin only/);
    await user(admin);
    await assert.rejects(ride(rideKey, null), /entregador/i);
    await assert.rejects(ride(key), /outro modo/i);
    const direct = await ride();
    assert.equal(direct.count, 2);
    const delivery = (
      await db.query(
        "SELECT d.*,o.status AS order_status FROM public.deliveries d JOIN public.orders o ON o.id=d.order_id",
      )
    ).rows[0];
    assert.equal(delivery.is_test, true);
    assert.equal(delivery.entregador_id, courier);
    assert.equal(delivery.status, "broadcasting");
    assert.equal(delivery.order_status, "waiting_courier");
    await db.query("UPDATE public.courier_profiles SET status='ocupado' WHERE user_id=$1", [
      courier,
    ]);
    assert.equal(
      (await ride()).count,
      2,
      "replay returns the same ride even if the courier status changed",
    );
    await assert.rejects(ride("94000000-0000-4000-8000-000000000021"), /online|livre/i);
    assert.equal((await db.query("SELECT count(*)::int n FROM public.deliveries")).rows[0].n, 1);
    await db.query("DELETE FROM public.addresses WHERE user_id=$1", [customer]);
    const pickup = await generate("94000000-0000-4000-8000-000000000006", null);
    assert.equal(pickup.count, 3);
    assert.equal(
      pickup.sales.find((s) => s.order_id !== order.id && s.order_id !== delivery.order_id)
        .freight_cents,
      0,
    );
    // Forced failure during approval rolls back the pending sale as well.
    await db.exec(
      "CREATE FUNCTION public.reject_generator_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected order failure'; END $$; CREATE TRIGGER reject_generator_order BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.reject_generator_order();",
    );
    await assert.rejects(
      generate("94000000-0000-4000-8000-000000000007", null),
      /injected order failure/,
    );
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM private.payment_test_sales")).rows[0].n,
      3,
    );
    await db.exec("SET ROLE anon");
    await assert.rejects(generate(), /permission denied/);
  } finally {
    await db.close();
  }
});
