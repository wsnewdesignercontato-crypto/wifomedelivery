import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const runtime = { tables: {}, failures: [], online: true, rpcReads: [] };
globalThis.__catalogReads = runtime;
const hooks = registerHooks({
  resolve(name, context, next) {
    let source;
    if (name === "@/integrations/supabase/client")
      source = `export const supabase={rpc(name,args){return {range(from,to){const r=globalThis.__catalogReads;r.rpcReads.push({name,args,from,to});return Promise.resolve({data:r.failures.includes(name)?null:(r.tables[name]??[]).filter(row=>args.p_establishment_ids.includes(row.establishment_id)).slice(from,to+1),error:r.failures.includes(name)?new Error("denied"):null})}}},from(table){let ids=[];return {select(){return this},in(column,values){ids=values;return this},eq(){return this},order(){return this},range(from,to){const r=globalThis.__catalogReads;return Promise.resolve({data:r.failures.includes(table)?null:(r.tables[table]??[]).filter(row=>ids.includes(row.establishment_id)).slice(from,to+1),error:r.failures.includes(table)?new Error("denied"):null})}}}};`;
    if (name === "./customer-catalog.functions")
      source =
        "export const getCatalogOnlineAvailability=async()=>globalThis.__catalogReads.online;";
    if (name === "./customer-catalog")
      return next("../src/lib/customer-catalog.ts", { ...context, parentURL: import.meta.url });
    return source
      ? { url: "data:text/javascript," + encodeURIComponent(source), shortCircuit: true }
      : next(name, context);
  },
});
const { loadCatalogFacts, loadCustomerCouponOffers } =
  await import("../src/lib/customer-catalog-data.ts");
test.after(() => {
  hooks.deregister();
  delete globalThis.__catalogReads;
});
const stores = [
  { id: "a", taxa_entrega_cents: 0, avaliacao: 5 },
  { id: "b", taxa_entrega_cents: 800, avaliacao: 4.5 },
];
function reset() {
  runtime.failures = [];
  runtime.online = true;
  runtime.rpcReads = [];
  runtime.tables = {
    products: [
      {
        id: "p",
        establishment_id: "a",
        disponivel: true,
        estoque: 1,
        preco_cents: 1000,
        preco_promo_cents: 800,
      },
    ],
    customer_coupon_offers: [
      {
        id: "c",
        establishment_id: "b",
        ativo: true,
        starts_at: null,
        expires_at: null,
        usage_limit: null,
        used_count: 0,
        type: "percent",
        percent: 10,
        value_cents: 0,
      },
    ],
    establishment_delivery_zones: [
      { id: "z", establishment_id: "a", ativo: true, taxa_cents: 500 },
    ],
    public_reviews: [{ id: "r", establishment_id: "b" }],
  };
}
test("public signals stay scoped to their own store and zones override the base fee", async () => {
  reset();
  const { facts, incomplete } = await loadCatalogFacts(stores);
  assert.equal(incomplete, false);
  assert.equal(facts.a.promotion, true);
  assert.equal(facts.b.promotion, false);
  assert.equal(facts.a.discount, false);
  assert.equal(facts.b.discount, true);
  assert.equal(facts.a.delivery.free, false);
  assert.equal(facts.a.delivery.fromCents, 500);
  assert.equal(facts.b.delivery.fromCents, 800);
  assert.equal(facts.a.rating, null);
  assert.equal(facts.b.rating, 4.5);
  assert.equal(facts.a.online, true);
});
test("failed signals hide only unverified benefits without discarding the store facts", async () => {
  reset();
  runtime.failures = ["products", "establishment_delivery_zones"];
  runtime.online = false;
  const { facts, incomplete } = await loadCatalogFacts(stores);
  assert.equal(incomplete, true);
  assert.equal(facts.a.promotion, false);
  assert.equal(facts.a.delivery.free, false);
  assert.equal(facts.a.delivery.fromCents, null);
  assert.equal(facts.a.online, false);
  assert.equal(facts.b.discount, true);
  assert.equal(facts.b.rating, 4.5);
});
test("an empty directory performs no optional catalog reads", async () => {
  reset();
  assert.deepEqual(await loadCatalogFacts([]), { facts: {}, incomplete: false });
});

test("catalog discounts come only from store participation offers, including anonymous global campaigns", async () => {
  reset();
  runtime.tables.coupons = [{ ...runtime.tables.customer_coupon_offers[0], establishment_id: "a" }];
  runtime.tables.customer_coupon_offers[0].code = null;
  const { facts, incomplete } = await loadCatalogFacts(stores);
  assert.equal(incomplete, false);
  assert.equal(facts.a.discount, false);
  assert.equal(facts.b.discount, true);
  assert.deepEqual(runtime.rpcReads[0].args, { p_establishment_ids: ["a", "b"] });
});

test("an offer read failure hides discounts and marks catalog facts incomplete", async () => {
  reset();
  runtime.failures = ["customer_coupon_offers"];
  const { facts, incomplete } = await loadCatalogFacts(stores);
  assert.equal(incomplete, true);
  assert.equal(facts.b.discount, false);
});

test("coupon discovery chunks unique store IDs and reads all pages without duplicate offers", async () => {
  reset();
  assert.equal(typeof loadCustomerCouponOffers, "function");
  const ids = Array.from({ length: 101 }, (_, index) => `store-${index}`);
  const row = runtime.tables.customer_coupon_offers[0];
  runtime.tables.customer_coupon_offers = [
    ...Array.from({ length: 1001 }, (_, index) => ({
      ...row,
      id: `campaign-${index}`,
      establishment_id: "store-0",
    })),
    { ...row, id: "campaign-last", establishment_id: "store-100" },
    { ...row, id: "campaign-last", establishment_id: "store-100" },
  ];
  const offers = await loadCustomerCouponOffers([...ids, "store-0"]);
  assert.equal(offers.length, 1002);
  assert.equal(offers.at(-1).establishment_id, "store-100");
  assert.ok(runtime.rpcReads.every((read) => read.args.p_establishment_ids.length <= 100));
  assert.ok(runtime.rpcReads.some((read) => read.from > 0));
  assert.deepEqual(await loadCustomerCouponOffers([]), []);
});
