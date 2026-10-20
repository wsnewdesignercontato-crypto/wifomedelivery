import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";

const jsx = loadTsx();
const reactUrl = import.meta.resolve("react");
const hooks = registerHooks({
  resolve(name, context, next) {
    if (name === "@tanstack/react-router")
      return {
        url:
          "data:text/javascript," +
          encodeURIComponent(
            `import React from ${JSON.stringify(reactUrl)};export const Link=({to,params,search,children,...props})=>React.createElement("a",{...props,href:to.replace("$id",params?.id??"$id")+"?"+new URLSearchParams(Object.entries(search??{}).filter(([,v])=>v!==undefined))},children)`,
          ),
        shortCircuit: true,
      };
    return next(name, context);
  },
});
const summary = await import("../src/components/checkout/checkout-summary.tsx");
const addresses = await import("../src/components/checkout/saved-checkout-addresses.tsx");
hooks.deregister();
jsx.deregister();
const quote = { subtotal_cents: 4500, frete_cents: 600, desconto_cents: 500, total_cents: 4600 };
function summaryHtml(props = {}) {
  assert.ok(summary, "checkout summary component must exist");
  return renderToStaticMarkup(
    React.createElement(summary.CheckoutSummary, {
      quote,
      pickup: false,
      coupon: "BEMVINDO",
      establishmentId: "store-id",
      canQuote: true,
      error: null,
      onRetry() {},
      ...props,
    }),
  );
}
const address = {
  id: "one",
  label: "Casa",
  rua: "Rua Central",
  numero: "10",
  bairro: "Centro",
  cidade: "Joinville",
  estado: "SC",
  cep: "89200000",
};
function addressHtml(list) {
  assert.ok(addresses, "saved address selector must exist");
  return renderToStaticMarkup(
    React.createElement(addresses.SavedCheckoutAddresses, {
      addresses: list,
      selectedId: "one",
      onSelect() {},
      coupon: "BEMVINDO",
    }),
  );
}

test("checkout displays server subtotal, freight, discount and total together", () => {
  const html = summaryHtml();
  for (const value of [
    "Subtotal",
    "Entrega",
    "Desconto",
    "Total",
    "45,00",
    "6,00",
    "5,00",
    "46,00",
    "BEMVINDO",
  ])
    assert.ok(html.includes(value), value);
});
test("checkout shows an explicit zero discount only when the server returned zero", () => {
  const html = summaryHtml({
    coupon: undefined,
    quote: { ...quote, desconto_cents: 0, total_cents: 5100 },
  });
  assert.match(html, /Desconto/);
  assert.match(html, /0,00/);
  assert.match(html, /51,00/);
});
test("loading never invents zero amounts and announces server price checking", () => {
  const html = summaryHtml({ quote: null });
  assert.match(html, /role="status"/);
  assert.match(html, /Conferindo/);
  assert.ok(!html.includes("R$"));
});
test("a rejected coupon offers removal and retry without displaying an orderable total", () => {
  const html = summaryHtml({ quote: null, error: "Coupon unavailable" });
  assert.match(html, /role="alert"/);
  assert.match(html, /cupom/i);
  assert.match(html, /Remover cupom/);
  assert.match(html, /Conferir novamente/);
  assert.ok(!html.includes("R$"));
});
test("one saved address shows one selected card without an extra address form", () => {
  const html = addressHtml([address]);
  assert.equal((html.match(/type="radio"/g) ?? []).length, 1);
  assert.match(html, /checked/);
  assert.match(html, /Rua Central/);
  assert.ok(!html.includes('type="text"'));
  assert.match(html, /\/cliente\/perfil\/enderecos\?checkout=true&amp;cupom=BEMVINDO/);
});
test("multiple saved addresses remain selectable and creation stays in profile", () => {
  const html = addressHtml([address, { ...address, id: "two", label: "Trabalho" }]);
  assert.equal((html.match(/type="radio"/g) ?? []).length, 2);
  assert.equal((html.match(/checked/g) ?? []).length, 1);
  assert.match(html, /Trabalho/);
  assert.ok(!html.includes('type="text"'));
});
test("no saved address links to the profile with checkout and coupon context", () => {
  const html = addressHtml([]);
  assert.match(html, /Nenhum endere/);
  assert.match(html, /Cadastrar endere/);
  assert.match(html, /checkout=true&amp;cupom=BEMVINDO/);
});

test("missing required addons explain how to correct the cart without removing a valid coupon", () => {
  const html = summaryHtml({
    quote: null,
    error: "Required addon group or selection limit not satisfied",
  });
  assert.match(html, /adicionais obrigatórios/);
  assert.match(html, /remova/i);
  assert.match(html, /adicione/i);
  assert.match(html, /Revisar carrinho/);
  assert.match(html, /Escolher adicionais na loja/);
  assert.match(html, /href="\/cliente\/estabelecimento\/store-id/);
  assert.ok(!html.includes("Required addon"));
  assert.ok(!html.includes("Remover cupom"));
  assert.ok(!html.includes("R$"));
});
