import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

// Deliberately local-only: no connection string, credential, or production project is accepted.
const container = "supabase_db_wifome-migration-verification";
function query(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-X",
      "-tA",
      "-v",
      "ON_ERROR_STOP=1",
    ]);
    let output = "",
      errors = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      errors += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output, errors }));
    child.stdin.end(sql);
  });
}
async function checked(sql, label) {
  const result = await query(sql);
  assert.equal(result.code, 0, `${label}: ${result.errors}`);
  return result.output;
}
async function waitForDatabase(sql, label) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if ((await checked(sql, label)).trim() === "t") return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
for (const file of [
  "customer-checkout-contact",
  "legacy-checkout-compatibility",
  "access-controls",
  "commerce-integrity",
  "checkout-lifecycle",
  "support-admin",
]) {
  await checked(
    await readFile(new URL(`../supabase/tests/${file}.sql`, import.meta.url), "utf8"),
    file,
  );
  console.log(`${file}: passed (rolled back)`);
}

const ids = Object.fromEntries(
  ["customer", "other", "owner", "store", "product", "coupon", "key"].map((name) => [
    name,
    randomUUID(),
  ]),
);
const identity = (id) =>
  `SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{"sub":"${id}","role":"authenticated"}',true);`;
const cart = (uid) =>
  `INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade) VALUES('${uid}','${ids.store}','${ids.product}','Concurrency cart',1,1);`;
const checkout = (uid, key, coupon = null) =>
  `BEGIN; ${identity(uid)} SELECT public.checkout_order('${ids.store}','${key}','pix','pickup',NULL,NULL,${coupon ? `'${coupon}'` : "NULL"}); SELECT pg_sleep(0.3); COMMIT;`;
try {
  await checked(
    `BEGIN;
    INSERT INTO auth.users(id,email,raw_user_meta_data) SELECT id,'db-concurrency-'||id||'@example.invalid','{}' FROM unnest(ARRAY['${ids.customer}'::uuid,'${ids.other}'::uuid,'${ids.owner}'::uuid]) id;
    UPDATE public.profiles SET telefone='31999999999' WHERE id IN ('${ids.customer}','${ids.other}');
    INSERT INTO public.addresses(user_id,rua,cidade,is_default) SELECT id,'Test street','Test city',true FROM unnest(ARRAY['${ids.customer}'::uuid,'${ids.other}'::uuid]) id;
    INSERT INTO public.establishments(id,owner_id,nome,status,is_open,kyc_status,pix_key,banco_titular) VALUES('${ids.store}','${ids.owner}','Concurrency contract','aprovado',true,'aprovado','fixture@example.invalid','Fixture');
    INSERT INTO public.products(id,establishment_id,nome,preco_cents,estoque,disponivel) VALUES('${ids.product}','${ids.store}','Concurrency product',1000,20,true);
    ${cart(ids.customer)} COMMIT;`,
    "concurrency setup",
  );
  const repeated = await Promise.all([
    query(checkout(ids.customer, ids.key)),
    query(checkout(ids.customer, ids.key)),
  ]);
  assert.ok(
    repeated.every((r) => r.code === 0),
    "Concurrent retries must both return the same successful result",
  );
  assert.equal(
    (
      await checked(
        `SELECT count(*) FROM public.orders WHERE cliente_id='${ids.customer}';`,
        "retry count",
      )
    ).trim(),
    "1",
  );
  assert.equal(
    (
      await checked(`SELECT estoque FROM public.products WHERE id='${ids.product}';`, "retry stock")
    ).trim(),
    "19",
  );
  console.log("Concurrent checkout retries: one order, one stock reservation");

  await checked(cart(ids.customer), "different-key cart");
  const different = await Promise.all([
    query(checkout(ids.customer, randomUUID())),
    query(checkout(ids.customer, randomUUID())),
  ]);
  assert.equal(
    different.filter((r) => r.code === 0).length,
    1,
    "Different simultaneous keys must not consume the same cart twice",
  );
  assert.equal(
    (
      await checked(
        `SELECT count(*) FROM public.orders WHERE cliente_id='${ids.customer}';`,
        "different-key count",
      )
    ).trim(),
    "2",
  );
  console.log("Concurrent different checkout keys: one success, one empty-cart denial");

  const couponCode = `LIMIT-${ids.coupon}`;
  await checked(
    `BEGIN; INSERT INTO public.coupons(id,code,type,percent,usage_limit) VALUES('${ids.coupon}','${couponCode}','percent',10,1); ${cart(ids.customer)} ${cart(ids.other)} COMMIT;`,
    "coupon setup",
  );
  const discounted = await Promise.all([
    query(checkout(ids.customer, randomUUID(), couponCode)),
    query(checkout(ids.other, randomUUID(), couponCode)),
  ]);
  assert.equal(
    discounted.filter((r) => r.code === 0).length,
    1,
    "Only one concurrent customer may redeem the last coupon use",
  );
  assert.equal(
    (
      await checked(
        `SELECT used_count FROM public.coupons WHERE id='${ids.coupon}';`,
        "coupon count",
      )
    ).trim(),
    "1",
  );
  console.log("Concurrent last coupon redemption: one success, usage limit preserved");

  // Hold the coupon after the cart cursor has opened, then commit a new item from another tab.
  const addedProduct = randomUUID();
  const lockApplication = `cart-lock-${ids.key}`;
  const checkoutApplication = `cart-checkout-${ids.key}`;
  await checked(
    `BEGIN; DELETE FROM public.cart_items WHERE user_id='${ids.customer}';
    UPDATE public.coupons SET used_count=0,usage_limit=NULL WHERE id='${ids.coupon}';
    INSERT INTO public.products(id,establishment_id,nome,preco_cents,estoque,disponivel) VALUES('${addedProduct}','${ids.store}','Added in second tab',800,10,true);
    ${cart(ids.customer)} COMMIT;`,
    "concurrent cart addition setup",
  );
  const blocker = query(
    `BEGIN; SET application_name='${lockApplication}'; SELECT id FROM public.coupons WHERE id='${ids.coupon}' FOR UPDATE; SELECT pg_sleep(4); COMMIT;`,
  );
  await waitForDatabase(
    `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='${lockApplication}' AND wait_event='PgSleep');`,
    "coupon lock",
  );
  const purchasing = query(
    `SET application_name='${checkoutApplication}'; ${checkout(ids.customer, randomUUID(), couponCode)}`,
  );
  await waitForDatabase(
    `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='${checkoutApplication}' AND wait_event_type='Lock');`,
    "checkout waiting after cart snapshot",
  );
  await checked(
    `INSERT INTO public.cart_items(user_id,establishment_id,product_id,nome_snapshot,preco_unit_cents,quantidade) VALUES('${ids.customer}','${ids.store}','${addedProduct}','Added later',800,1);`,
    "second tab adds a new product",
  );
  const [unlocked, purchased] = await Promise.all([blocker, purchasing]);
  assert.equal(unlocked.code, 0, unlocked.errors);
  assert.equal(purchased.code, 0, purchased.errors);
  assert.equal(
    (
      await checked(
        `SELECT count(*) FROM public.cart_items WHERE user_id='${ids.customer}' AND product_id='${addedProduct}';`,
        "new cart row remains",
      )
    ).trim(),
    "1",
    "Checkout must delete only the purchased snapshot rows",
  );
  assert.equal(
    (
      await checked(
        `SELECT count(*) FROM public.order_items WHERE product_id='${addedProduct}';`,
        "new product was not purchased",
      )
    ).trim(),
    "0",
  );
  console.log("Concurrent cart addition: unpurchased item remains in cart");

  await checked(
    `INSERT INTO public.platform_ledger(order_id,establishment_id,gross_cents,commission_cents,delivery_fee_cents,courier_payout_cents,merchant_payout_cents,platform_revenue_cents,status) SELECT id,establishment_id,2000,0,0,0,2000,0,'paid' FROM public.orders WHERE checkout_key='${ids.key}';`,
    "wallet setup",
  );
  const withdrawalKey = randomUUID();
  const retryWithdrawal = `BEGIN; ${identity(ids.owner)} SELECT public.request_withdrawal('merchant',700,'${ids.store}','${withdrawalKey}'); SELECT pg_sleep(0.3); COMMIT;`;
  const repeatedWithdrawals = await Promise.all([query(retryWithdrawal), query(retryWithdrawal)]);
  assert.ok(
    repeatedWithdrawals.every((result) => result.code === 0),
    "Concurrent withdrawal retries must both return the original request",
  );
  assert.equal(
    (
      await checked(
        `SELECT count(*) FROM public.establishment_withdrawals WHERE establishment_id='${ids.store}';`,
        "withdrawal retry count",
      )
    ).trim(),
    "1",
  );
  console.log("Concurrent withdrawal retries: one request even with funds for two");
  const withdraw = `BEGIN; ${identity(ids.owner)} SELECT public.request_withdrawal('merchant',700,'${ids.store}',gen_random_uuid()); SELECT pg_sleep(0.3); COMMIT;`;
  const withdrawals = await Promise.all([query(withdraw), query(withdraw)]);
  assert.equal(
    withdrawals.filter((r) => r.code === 0).length,
    1,
    "Concurrent withdrawal requests must reserve balance before the second request",
  );
  assert.equal(
    (
      await checked(
        `SELECT coalesce(sum(valor_cents),0) FROM public.establishment_withdrawals WHERE establishment_id='${ids.store}';`,
        "withdrawal sum",
      )
    ).trim(),
    "1400",
  );
  console.log("Concurrent withdrawals: one success, no overdraft");
} finally {
  await checked(
    `BEGIN;
    DELETE FROM public.establishment_withdrawals WHERE establishment_id='${ids.store}';
    DELETE FROM public.platform_ledger WHERE establishment_id='${ids.store}';
    DELETE FROM public.orders WHERE establishment_id='${ids.store}';
    DELETE FROM public.coupons WHERE id='${ids.coupon}';
    DELETE FROM public.establishments WHERE id='${ids.store}';
    DELETE FROM auth.users WHERE id IN ('${ids.customer}','${ids.other}','${ids.owner}');
    COMMIT;`,
    "concurrency cleanup",
  );
  console.log("Concurrency fixtures removed from isolated local database");
}
