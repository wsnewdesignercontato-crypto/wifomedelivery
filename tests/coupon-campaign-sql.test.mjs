import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPaymentDatabase } from "./helpers/payment-database.mjs";

const id = (n) => `aa000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1),
  merchant = id(2),
  other = id(3),
  customer = id(4),
  store = id(5),
  secondStore = id(6),
  coupon = id(7),
  product = id(8),
  key = id(9);
let db;
async function user(uid) {
  await db.exec(
    `RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${uid}',false); SELECT set_config('request.jwt.claims','{"sub":"${uid}","role":"authenticated"}',false)`,
  );
}
async function scalar(sql) {
  return (await db.query(sql)).rows[0].value;
}
const revision = () =>
  scalar(`SELECT campaign_revision::text AS value FROM public.coupons WHERE id='${coupon}'`);
const choose = async (participating, rev) =>
  db.query(`SELECT public.set_coupon_participation($1,$2,$3,$4)`, [
    store,
    coupon,
    rev,
    participating,
  ]);
const quote = () =>
  scalar(
    `SELECT public.quote_order('${store}',gen_random_uuid(),'pix','pickup',NULL,NULL,'CAMPAIGN15') AS value`,
  );

test.before(async () => {
  db = await createPaymentDatabase();
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261023051059_merchant_opt_in_coupon_campaigns.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(`
    INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
    ('${admin}','campaign-admin@example.invalid',now()),('${merchant}','campaign-owner@example.invalid',now()),
    ('${other}','campaign-other@example.invalid',now()),('${customer}','campaign-client@example.invalid',now());
    INSERT INTO public.user_roles(user_id,role) VALUES('${admin}','admin');
    INSERT INTO public.profiles(id,nome,telefone) VALUES ('${customer}','Campaign customer','31999999999');
    INSERT INTO public.addresses(user_id,rua,cidade,is_default) VALUES('${customer}','Fixture street','Test city',true);
    INSERT INTO public.establishments(id,owner_id,nome,status,is_open,cidade,taxa_entrega_cents) VALUES
    ('${store}','${merchant}','Campaign store','aprovado',true,'Test city',900),('${secondStore}','${other}','Other store','aprovado',true,'Test city',900);
    INSERT INTO public.products(id,establishment_id,nome,preco_cents,estoque,disponivel) VALUES('${product}','${store}','Campaign product',10000,20,true);
    INSERT INTO public.coupons(id,code,type,percent,ativo) VALUES('${coupon}','CAMPAIGN15','percent',15,true);
    INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade) VALUES('${customer}','${store}','${product}','Product',10000,1);
  `);
});
test.after(async () => {
  if (db) await db.close();
});

test("published coupons require affirmative store acceptance and cannot be created by a merchant", async () => {
  await user(customer);
  await assert.rejects(quote, /Coupon unavailable/);
  assert.equal(
    (await db.query(`SELECT * FROM public.customer_coupon_offers(ARRAY['${store}'::uuid])`)).rows
      .length,
    0,
  );
  await user(merchant);
  await assert.rejects(
    db.exec(`INSERT INTO public.coupons(code,type,percent) VALUES('FORGED','percent',20)`),
    /permission|policy|Forbidden/i,
  );
  const list = await scalar(`SELECT public.merchant_coupon_campaigns('${store}') AS value`);
  assert.equal(list[0].participating, false);
  assert.equal(list[0].percent, 15);
});
test("a shop cannot enroll another shop or forge acceptance of a different revision", async () => {
  await user(admin);
  const rev = await revision();
  await user(other);
  await assert.rejects(choose(true, rev), /Forbidden/);
  await user(merchant);
  await assert.rejects(choose(true, id(99)), /changed|alterad/i);
  await choose(true, rev);
  await assert.rejects(
    db.exec(
      `UPDATE public.coupon_participations SET establishment_id='${secondStore}' WHERE coupon_id='${coupon}'`,
    ),
    /permission|policy/i,
  );
});
test("customer offers include only participating stores; quote, order and retries agree on merchant funding", async () => {
  await user(customer);
  const offers = (
    await db.query(
      `SELECT * FROM public.customer_coupon_offers(ARRAY['${store}'::uuid,'${secondStore}'::uuid])`,
    )
  ).rows;
  assert.equal(offers.length, 1);
  assert.equal(offers[0].establishment_id, store);
  assert.equal(offers[0].code, "CAMPAIGN15");
  assert.deepEqual(await quote(), {
    subtotal_cents: 10000,
    frete_cents: 0,
    desconto_cents: 1500,
    total_cents: 8500,
  });
  const result = await scalar(
    `SELECT public.checkout_order('${store}','${key}','pix','pickup',NULL,NULL,'CAMPAIGN15',8500,false) AS value`,
  );
  await db.exec("RESET ROLE");
  const order = (
    await db.query(
      `SELECT coupon_funder,discount_funder,coupon_campaign_revision,total_cents FROM public.orders WHERE id=$1`,
      [result.order_id],
    )
  ).rows[0];
  assert.equal(order.coupon_funder, "merchant");
  assert.equal(order.discount_funder, "establishment");
  assert.equal(order.total_cents, 8500);
  assert.equal(order.coupon_campaign_revision, await revision());
  const rev = await revision();
  await user(merchant);
  await choose(false, rev);
  await user(customer);
  assert.equal(
    (
      await scalar(
        `SELECT public.checkout_order('${store}','${key}','pix','pickup',NULL,NULL,'CAMPAIGN15',8500,false) AS value`,
      )
    ).order_id,
    result.order_id,
  );
  assert.equal(
    (await db.query(`SELECT * FROM public.customer_coupon_offers(ARRAY['${store}'::uuid])`)).rows
      .length,
    0,
  );
});
test("changed financial terms require a new acceptance and preserve previous orders", async () => {
  await user(admin);
  const oldRevision = await revision();
  await user(merchant);
  await choose(true, oldRevision);
  await user(admin);
  await db.exec(`UPDATE public.coupons SET percent=20 WHERE id='${coupon}'`);
  const next = await revision();
  assert.notEqual(next, oldRevision);
  await user(merchant);
  const list = await scalar(`SELECT public.merchant_coupon_campaigns('${store}') AS value`);
  assert.equal(list[0].participating, false);
  assert.equal(list[0].requires_reacceptance, true);
  await assert.rejects(choose(true, oldRevision), /changed|alterad/i);
  await choose(true, next);
  await db.exec(
    `RESET ROLE; INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade) VALUES('${customer}','${store}','${product}','Product',10000,1)`,
  );
  await user(customer);
  assert.equal((await quote()).desconto_cents, 2000);
  await db.exec("RESET ROLE");
  assert.equal(
    await scalar(`SELECT total_cents AS value FROM public.orders WHERE checkout_key='${key}'`),
    8500,
  );
  await assert.rejects(
    db.exec(
      `UPDATE public.orders SET coupon_campaign_revision='${next}' WHERE checkout_key='${key}'`,
    ),
    /immutable/i,
  );
});
test("pauses, exhausted usage and expired campaigns are unavailable, even with prior acceptance", async () => {
  await user(admin);
  await db.exec(`UPDATE public.coupons SET ativo=false WHERE id='${coupon}'`);
  await user(customer);
  await assert.rejects(quote, /Coupon unavailable/);
  await user(admin);
  await db.exec(`UPDATE public.coupons SET ativo=true,usage_limit=2 WHERE id='${coupon}'`);
  let rev = await revision();
  await user(merchant);
  await choose(true, rev);
  await db.exec(`RESET ROLE; UPDATE public.coupons SET used_count=2 WHERE id='${coupon}'`);
  await user(customer);
  await assert.rejects(quote, /Coupon unavailable/);
  await user(admin);
  await db.exec(
    `UPDATE public.coupons SET usage_limit=NULL,expires_at=now()-interval '1 second' WHERE id='${coupon}'`,
  );
  rev = await revision();
  await user(merchant);
  await assert.rejects(choose(true, rev), /unavailable|dispon.vel/i);
  await user(customer);
  await assert.rejects(quote, /Coupon unavailable/);
});
test("the ledger deducts the accepted discount from merchant proceeds and keeps the original order terms", async () => {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${admin}',false)`);
  for (const status of ["accepted", "preparing", "ready", "delivered"]) {
    await db.exec(`UPDATE public.orders SET status='${status}' WHERE checkout_key='${key}'`);
  }
  const ledger = (
    await db.query(
      `SELECT merchant_payout_cents,platform_revenue_cents,discount_cents,discount_funder,status FROM public.platform_ledger WHERE order_id=(SELECT id FROM public.orders WHERE checkout_key='${key}')`,
    )
  ).rows[0];
  assert.deepEqual(ledger, {
    merchant_payout_cents: 7000,
    platform_revenue_cents: 1500,
    discount_cents: 1500,
    discount_funder: "establishment",
    status: "pending",
  });
});
test("anonymous discovery never leaks coupon codes or private participation identities", async () => {
  await user(admin);
  await db.exec(`UPDATE public.coupons SET expires_at=NULL,usage_limit=NULL WHERE id='${coupon}'`);
  const rev = await revision();
  await user(merchant);
  await choose(true, rev);
  await db.exec(
    `RESET ROLE; REVOKE USAGE ON SCHEMA private FROM anon; SELECT set_config('request.jwt.claim.sub','',false); SET ROLE anon`,
  );
  const offers = (
    await db.query(`SELECT * FROM public.customer_coupon_offers(ARRAY['${store}'::uuid])`)
  ).rows;
  assert.equal(offers.length, 1);
  assert.equal(offers[0].code, null);
  assert.equal("owner_id" in offers[0], false);
  await assert.rejects(db.exec("SELECT establishment_id FROM public.coupons"), /permission/i);
  await assert.rejects(db.exec(`SELECT * FROM public.coupon_participations`), /permission/i);
  await assert.rejects(
    db.exec(`SELECT public.merchant_coupon_campaigns('${store}')`),
    /permission/i,
  );
});

test("the hosted rollback contract exercises the installed policies and restores all fixtures", async () => {
  await db.exec("RESET ROLE");
  const before = await scalar("SELECT count(*)::int AS value FROM public.orders");
  await db.exec(
    await readFile(new URL("../supabase/tests/coupon-campaigns.sql", import.meta.url), "utf8"),
  );
  assert.equal(await scalar("SELECT count(*)::int AS value FROM public.orders"), before);
  assert.equal(
    await scalar("SELECT count(*)::int AS value FROM public.coupons WHERE code LIKE 'QA-%'"),
    0,
  );
});

test("online checkout reserves the same merchant-funded discount and blocks new orders after opt-out", async () => {
  await user(admin);
  await db.exec("RESET ROLE"); // Configure synthetic credentials through the trusted server role.
  await db.exec(`SELECT public.asaas_settings_save('production','notify@example.invalid',repeat('k',64),repeat('t',64));
    SELECT public.asaas_connection_complete('production',(public.asaas_settings_get('production')->>'revision')::uuid,true);
    SELECT public.asaas_webhook_complete('production',(public.asaas_settings_get('production')->>'revision')::uuid,'hook_fixture');
    RESET ROLE; UPDATE asaas_private.settings SET registered_payment_contract=1 WHERE environment='production';`);
  await db.exec("SELECT public.asaas_online_set_enabled(true)");
  const rev = await revision();
  await user(merchant);
  await choose(true, rev);
  const onlineKey = id(20);
  await user(customer);
  const created = await scalar(
    `SELECT public.checkout_online_order('${store}','${onlineKey}','cartao','pickup',NULL,NULL,'CAMPAIGN15',8000) AS value`,
  );
  await db.exec("RESET ROLE");
  const order = (
    await db.query(
      "SELECT status,total_cents,desconto_cents,coupon_funder,acceptance_deadline FROM public.orders WHERE id=$1",
      [created.order_id],
    )
  ).rows[0];
  assert.deepEqual(order, {
    status: "pending_payment",
    total_cents: 8000,
    desconto_cents: 2000,
    coupon_funder: "merchant",
    acceptance_deadline: null,
  });
  assert.equal(
    await scalar(
      `SELECT count(*)::int AS value FROM public.platform_ledger WHERE order_id='${created.order_id}'`,
    ),
    0,
  );
  await user(merchant);
  await choose(false, rev);
  await user(customer);
  assert.equal(
    (
      await scalar(
        `SELECT public.checkout_online_order('${store}','${onlineKey}','cartao','pickup',NULL,NULL,'CAMPAIGN15',8000) AS value`,
      )
    ).order_id,
    created.order_id,
  );
  await db.exec(
    `RESET ROLE; INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade) VALUES('${customer}','${store}','${product}','Product',10000,1)`,
  );
  const stock = await scalar(`SELECT estoque AS value FROM public.products WHERE id='${product}'`);
  await user(customer);
  await assert.rejects(
    scalar(
      `SELECT public.checkout_online_order('${store}',gen_random_uuid(),'pix','pickup',NULL,NULL,'CAMPAIGN15',8000) AS value`,
    ),
    /Coupon unavailable/,
  );
  await db.exec("RESET ROLE");
  assert.equal(
    await scalar(`SELECT estoque AS value FROM public.products WHERE id='${product}'`),
    stock,
  );
});
