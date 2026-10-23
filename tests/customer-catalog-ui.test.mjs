import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";
import { emptyCatalogFilters } from "../src/lib/customer-catalog.ts";
const jsx = loadTsx();
const assets = registerHooks({
  resolve(name, context, next) {
    return /\.(jpg|png)$/.test(name)
      ? {
          url:
            "data:text/javascript," + encodeURIComponent(`export default ${JSON.stringify(name)}`),
          shortCircuit: true,
        }
      : next(name, context);
  },
});
const { CategoryArtwork, CatalogFilterBar, CatalogBadges, CatalogRating } =
  await import("../src/components/cliente/catalog-discovery.tsx");
test.after(() => {
  assets.deregister();
  jsx.deregister();
});
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
test("filter rail announces combinable selections and retains visible horizontal scrolling", () => {
  const html = render(CatalogFilterBar, {
    filters: { ...emptyCatalogFilters(), online: true },
    onChange() {},
  });
  assert.match(html, /overflow-x-auto/);
  assert.doesNotMatch(html, /scrollbar-hide/);
  assert.match(html, /aria-pressed="true"[^>]*>.*?Pagamento online/s);
  for (const label of ["Frete grátis", "Promoções", "Com desconto", "Avaliação 4+"])
    assert.ok(html.includes(label));
});
test("category tiles use relevant photos or SVG artwork and an unknown category gets a food photo", () => {
  assert.match(render(CategoryArtwork, { slug: "pizzas", name: "Pizzas" }), /cat-pizza.jpg/);
  assert.match(render(CategoryArtwork, { slug: "pet-shops", name: "Pet shops" }), /<svg/);
  assert.doesNotMatch(render(CategoryArtwork, { slug: "pet-shops", name: "Pet shops" }), /<img/);
  assert.match(
    render(CategoryArtwork, { slug: "unknown", name: "Nova categoria" }),
    /hero-food.jpg/,
  );
});
test("store badges render only observed benefits and disclose coupon and area conditions", () => {
  const facts = {
    promotion: false,
    discount: false,
    online: false,
    rating: null,
    reviewCount: 0,
    delivery: { free: false, label: null, fromCents: 500, conditional: false },
  };
  assert.equal(render(CatalogBadges, { facts }), "");
  const html = render(CatalogBadges, {
    facts: {
      ...facts,
      promotion: true,
      discount: true,
      online: true,
      delivery: { ...facts.delivery, free: true, label: "Frete grátis em áreas selecionadas" },
    },
  });
  for (const label of [
    "Promoção",
    "Cupom disponível",
    "Pagamento online",
    "Frete grátis em áreas selecionadas",
  ])
    assert.ok(html.includes(label), label);
  assert.match(html, /condições do cupom/);
  assert.match(render(CatalogRating, { facts }), /Novo/);
  assert.doesNotMatch(render(CatalogRating, { facts }), /5\.0/);
  assert.match(
    render(CatalogRating, { facts: { ...facts, rating: 4.7, reviewCount: 12 } }),
    /4\.7.*12/s,
  );
});
