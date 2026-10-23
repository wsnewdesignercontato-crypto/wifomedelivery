import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";

// Server rendering does not run effects. Seed the loaded checkout state while
// keeping React rendering, the real form, summary and saved-address cards.
const address = {
  id: "one",
  label: "Casa",
  rua: "Rua Central",
  numero: "10",
  complemento: null,
  bairro: "Centro",
  cidade: "Joinville",
  estado: "SC",
  cep: null,
  lat: null,
  lng: null,
  is_default: true,
};
const runtime = {
  stateIndex: 0,
  values: [
    false,
    false,
    0,
    null,
    [address],
    "one",
    "pix",
    "delivery",
    "",
    false,
    { id: "store", nome: "Loja", taxa_entrega_cents: 500, pedido_minimo_cents: 0 },
    "cart",
    false,
    "47999999999",
    true,
    false,
    null,
    false,
  ],
};
globalThis.__checkoutRoute = runtime;
const reactUrl = import.meta.resolve("react");
const jsx = loadTsx();
const hooks = registerHooks({
  resolve(name, context, next) {
    let source;
    if (
      name === "react" &&
      context.parentURL?.includes("/routes/_authenticated/cliente.checkout.tsx")
    )
      source = `export * from ${JSON.stringify(reactUrl)};import {useState as realUseState,useReducer as realUseReducer} from ${JSON.stringify(reactUrl)};export const useState=(initial)=>{const r=globalThis.__checkoutRoute;const index=r.stateIndex++;return realUseState(r.overrides&&index in r.overrides?r.overrides[index]:index<r.values.length?r.values[index]:initial)};export const useReducer=(reducer,initial)=>realUseReducer(reducer,globalThis.__checkoutRoute.quote??initial);`;
    if (name === "@tanstack/react-router")
      source = `import React from ${JSON.stringify(reactUrl)};export const useLocation=()=>({pathname:'/cliente/checkout',searchStr:''});export const createFileRoute=()=>options=>({...options,useRouteContext:()=>({user:globalThis.__checkoutRoute.user??{id:"customer"}}),useSearch:()=>({cupom:"BEMVINDO"})});export const useNavigate=()=>()=>{};export const Link=({to,search,children,...props})=>React.createElement("a",{...props,href:to+"?"+new URLSearchParams(Object.entries(search??{}).filter(([,v])=>v!==undefined))},children);`;
    if (name === "@tanstack/react-start") source = "export const useServerFn=()=>async()=>{};";
    if (name === "@/lib/checkout.functions")
      source = "export const placeOrder=()=>{};export const quoteOrder=()=>{};";
    if (name === "@/lib/asaas-payment.functions")
      source =
        "export const getOnlinePaymentAvailability=()=>{};export const startOnlineOrder=()=>{};export const listSavedCards=()=>[];export const removeSavedCard=()=>({removed:true});";
    if (name === "@/integrations/supabase/client") source = "export const supabase={};";
    if (source)
      return { url: "data:text/javascript," + encodeURIComponent(source), shortCircuit: true };
    return next(name, context);
  },
});

const { Route } = await import("../src/routes/_authenticated/cliente.checkout.tsx");
hooks.deregister();
jsx.deregister();

function paidCheckoutFixture(method = "cartao") {
  runtime.values[0] = true;
  runtime.values[1] = true;
  runtime.values[6] = method;
  const { label, rua, numero, complemento, bairro, cidade, estado, cep, lat, lng } = address;
  runtime.quote = {
    requestId: 1,
    status: "ready",
    fingerprint: JSON.stringify({
      checkoutData: {
        establishment_id: "store",
        forma_pagamento: method,
        tipo_entrega: "delivery",
        endereco: { label, rua, numero, complemento, bairro, cidade, estado, cep, lat, lng },
        observacoes: null,
        coupon_code: "BEMVINDO",
      },
      cartFingerprint: "cart",
    }),
    quote: { subtotal_cents: 4500, frete_cents: 600, desconto_cents: 500, total_cents: 4600 },
    error: null,
  };
  runtime.stateIndex = 0;
  try {
    return renderToStaticMarkup(React.createElement(Route.component));
  } finally {
    runtime.quote = undefined;
    runtime.values[0] = false;
    runtime.values[1] = false;
    runtime.values[6] = "pix";
  }
}
test("premium checkout keeps the customer logo, validated total and opt-in new-card payment", () => {
  const html = paidCheckoutFixture();
  assert.match(html, /PedeTrem Cliente/);
  assert.match(html, /Pagar R\$.*46,00/);
  assert.match(html, /Salvar cart/);
  assert.match(html, /lg:grid-cols-/);
  assert.match(html, /name="ccv"/);
  assert.match(html, /Nome no cartão/);
});

if (process.env.PEDETREM_CHECKOUT_PREVIEW) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(process.env.PEDETREM_CHECKOUT_PREVIEW, paidCheckoutFixture());
}

test.after(() => delete globalThis.__checkoutRoute);

test("the loaded checkout shows pricing before the address, saved addresses only, and all delivery payment options", () => {
  runtime.stateIndex = 0;
  const html = renderToStaticMarkup(React.createElement(Route.component));
  assert.ok(html.indexOf("Resumo do pedido") >= 0, "summary is present");
  assert.ok(
    html.indexOf("Resumo do pedido") < html.indexOf("Rua Central"),
    "summary is visible before the address",
  );
  assert.equal((html.match(/type="radio"/g) ?? []).length, 1);
  assert.ok(!html.includes('placeholder="Rua"'), "new addresses belong in profile");
  assert.match(html, /Gerenciar endereços no perfil/);
  assert.match(html, /Pix na entrega/);
  assert.match(html, /Cartão na entrega/);
  assert.match(html, /Dinheiro/);
  assert.match(html, /disabled=""[^>]*>Confirmar pedido/);
});

test("pickup payment choices identify the pickup context for all three methods", () => {
  runtime.values[0] = true;
  runtime.values[7] = "pickup";
  runtime.stateIndex = 0;
  try {
    const html = renderToStaticMarkup(React.createElement(Route.component));
    assert.match(html, /Pagar na retirada/);
    for (const label of ["Pix na retirada", "Cartão na retirada", "Dinheiro na retirada"])
      assert.ok(html.includes(label), label);
    assert.doesNotMatch(html, /Pagar na entrega|Pix na entrega|Cartão na entrega/);
  } finally {
    runtime.values[0] = false;
    runtime.values[7] = "delivery";
  }
});

test("online choices contain only online Pix and card while offline cash stays in its own context", () => {
  const html = paidCheckoutFixture("pix");
  const choices = html.slice(html.indexOf("Forma de pagamento"), html.indexOf("Observações"));
  assert.match(choices, /Pagar online/);
  assert.match(choices, /Pix online/);
  assert.match(choices, /Cartão online/);
  assert.doesNotMatch(choices, /Dinheiro/);
});

test("checkout preloads account payer data and selected saved billing address", () => {
  runtime.user = { id: "customer", email: "account@example.invalid" };
  runtime.overrides = {
    23: { userId: "customer", name: "Cliente cadastrado", phone: "47999999999" },
  };
  try {
    const html = paidCheckoutFixture();
    for (const value of [
      "Cliente cadastrado",
      "account@example.invalid",
      "47999999999",
      'name="addressNumber"',
      'value="10"',
    ])
      assert.ok(html.includes(value), value);
  } finally {
    runtime.overrides = undefined;
    runtime.user = undefined;
  }
});

test("checkout never prefills a new account with the previous account payer details", () => {
  runtime.user = { id: "customer", email: "new@example.invalid" };
  runtime.overrides = {
    23: { userId: "previous-account", name: "Nome privado anterior", phone: "47988888888" },
  };
  try {
    const html = paidCheckoutFixture();
    assert.doesNotMatch(html, /Nome privado anterior|47988888888/);
    assert.match(html, /name="name"[^>]*value=""/);
  } finally {
    runtime.overrides = undefined;
    runtime.user = undefined;
  }
});
