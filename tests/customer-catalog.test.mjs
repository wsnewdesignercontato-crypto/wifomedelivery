import test from "node:test";
import assert from "node:assert/strict";
import {
  categoryArtworkKey,
  isCurrentCoupon,
  isProductPromotion,
  catalogStoreFacts,
  matchesCatalogFilters,
  emptyCatalogFilters,
} from "../src/lib/customer-catalog.ts";

test("category artwork resolves accents, plurals and known business aliases before neutral fallback", () => {
  for (const [slug, name, expected] of [
    ["pizzas", "Pizza", "pizza"],
    ["hambúrgueres", "Hambúrgueres", "hamburguer"],
    ["açaí", "Açaí", "acai"],
    ["porções", "Porções", "porcoes"],
    ["sorveterias", "Sorvetes", "sorvete"],
    ["slug-novo", "Panificadoras", "padaria"],
    ["salgaderia", "Salgaderia", "pastel"],
    ["pet-shops", "Pet shops", "petshop"],
    ["cosmeticos-e-perfumaria", "Cosméticos e perfumaria", "cosmeticos"],
    ["despachos-e-encomendas", "Despachos e encomendas", "encomendas"],
    ["nova-categoria", "Nova categoria", "neutral"],
  ])
    assert.equal(categoryArtworkKey(slug, name), expected, slug);
});
const now = new Date("2026-10-22T15:00:00Z");
const coupon = {
  ativo: true,
  starts_at: null,
  expires_at: null,
  usage_limit: null,
  used_count: 0,
  type: "percent",
  percent: 10,
  value_cents: 0,
};
test("discount coupons require active dates, remaining uses and a real benefit", () => {
  assert.equal(isCurrentCoupon(coupon, now), true);
  for (const change of [
    { ativo: false },
    { starts_at: "2026-10-22T15:00:01Z" },
    { expires_at: "2026-10-22T15:00:00Z" },
    { usage_limit: 2, used_count: 2 },
    { starts_at: "invalid" },
    { expires_at: "invalid" },
    { percent: 0 },
    { type: "fixed", value_cents: 0 },
  ])
    assert.equal(isCurrentCoupon({ ...coupon, ...change }, now), false, JSON.stringify(change));
  assert.equal(
    isCurrentCoupon(
      { ...coupon, starts_at: now.toISOString(), type: "fixed", value_cents: 100 },
      now,
    ),
    true,
  );
  assert.equal(isCurrentCoupon({ ...coupon, type: "free_delivery", percent: 0 }, now), true);
});
test("product promotions need a positive lower price and an available in-stock item", () => {
  const product = { preco_cents: 1000, preco_promo_cents: 800, disponivel: true, estoque: null };
  assert.equal(isProductPromotion(product), true);
  assert.equal(isProductPromotion({ ...product, estoque: 1 }), true);
  for (const change of [
    { preco_promo_cents: 0 },
    { preco_promo_cents: 1000 },
    { preco_promo_cents: 1500 },
    { preco_promo_cents: null },
    { disponivel: false },
    { estoque: 0 },
  ])
    assert.equal(isProductPromotion({ ...product, ...change }), false);
});
const store = { taxa_entrega_cents: 0, avaliacao: 5 };
const base = { products: [], coupons: [], zones: [], reviewCount: 0, onlineEnabled: false, now };
test("badges distinguish product promotions, coupon discounts and verified online availability", () => {
  const facts = catalogStoreFacts(store, { ...base, coupons: [coupon] });
  assert.equal(facts.promotion, false);
  assert.equal(facts.discount, true);
  assert.equal(facts.online, false);
  assert.equal(facts.rating, null, "default five stars are not a review");
  assert.equal(
    catalogStoreFacts(store, { ...base, onlineEnabled: true, reviewCount: 3 }).rating,
    5,
  );
  assert.equal(catalogStoreFacts(store, { ...base, onlineEnabled: true }).online, true);
});
test("delivery zones override base price and conditional free delivery is disclosed", () => {
  assert.equal(catalogStoreFacts(store, base).delivery.label, "Frete grátis");
  const charged = catalogStoreFacts(store, { ...base, zones: [{ ativo: true, taxa_cents: 500 }] });
  assert.equal(charged.delivery.free, false);
  assert.equal(charged.delivery.fromCents, 500);
  const mixed = catalogStoreFacts(
    { ...store, taxa_entrega_cents: 800 },
    {
      ...base,
      zones: [
        { ativo: true, taxa_cents: 0 },
        { ativo: true, taxa_cents: 500 },
      ],
    },
  );
  assert.equal(mixed.delivery.free, true);
  assert.equal(mixed.delivery.label, "Frete grátis em áreas selecionadas");
  assert.equal(
    catalogStoreFacts(store, { ...base, zones: [{ ativo: false, taxa_cents: 500 }] }).delivery
      .label,
    "Frete grátis",
  );
  assert.equal(
    catalogStoreFacts(store, { ...base, zones: null }).delivery.free,
    false,
    "unknown delivery rules must not advertise free freight",
  );
});
test("catalog filters combine with AND, keep independent signals and reset with empty state", () => {
  const facts = catalogStoreFacts(store, {
    ...base,
    coupons: [coupon],
    onlineEnabled: true,
    reviewCount: 2,
  });
  assert.equal(matchesCatalogFilters(facts, emptyCatalogFilters()), true);
  assert.equal(
    matchesCatalogFilters(facts, {
      ...emptyCatalogFilters(),
      freeDelivery: true,
      discount: true,
      online: true,
      rating: true,
    }),
    true,
  );
  assert.equal(
    matchesCatalogFilters(facts, { ...emptyCatalogFilters(), promotion: true, discount: true }),
    false,
  );
  assert.equal(
    matchesCatalogFilters({ ...facts, rating: null }, { ...emptyCatalogFilters(), rating: true }),
    false,
  );
  assert.equal(
    matchesCatalogFilters({ ...facts, rating: 3.9 }, { ...emptyCatalogFilters(), rating: true }),
    false,
  );
});

test("catalog facts paginate all public rows and reject partial failed reads", async () => {
  const { readCatalogPages } = await import("../src/lib/customer-catalog.ts");
  const ranges = [];
  const rows = await readCatalogPages(async (from, to) => {
    ranges.push([from, to]);
    return {
      data: from === 0 ? Array.from({ length: 250 }, (_, id) => ({ id })) : [{ id: 250 }],
      error: null,
    };
  });
  assert.equal(rows.length, 251);
  assert.deepEqual(ranges, [
    [0, 249],
    [250, 499],
  ]);
  await assert.rejects(
    () => readCatalogPages(async () => ({ data: null, error: new Error("denied") })),
    /denied/,
  );
});
