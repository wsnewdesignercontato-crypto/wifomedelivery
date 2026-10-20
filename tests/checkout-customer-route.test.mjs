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
      source = `export * from ${JSON.stringify(reactUrl)};import {useState as realUseState} from ${JSON.stringify(reactUrl)};export const useState=(initial)=>{const r=globalThis.__checkoutRoute;const index=r.stateIndex++;return realUseState(index<r.values.length?r.values[index]:initial)};`;
    if (name === "@tanstack/react-router")
      source = `import React from ${JSON.stringify(reactUrl)};export const createFileRoute=()=>options=>({...options,useRouteContext:()=>({user:{id:"customer"}}),useSearch:()=>({cupom:"BEMVINDO"})});export const useNavigate=()=>()=>{};export const Link=({to,search,children,...props})=>React.createElement("a",{...props,href:to+"?"+new URLSearchParams(Object.entries(search??{}).filter(([,v])=>v!==undefined))},children);`;
    if (name === "@tanstack/react-start") source = "export const useServerFn=()=>async()=>{};";
    if (name === "@/lib/checkout.functions")
      source = "export const placeOrder=()=>{};export const quoteOrder=()=>{};";
    if (name === "@/lib/asaas-payment.functions")
      source =
        "export const getOnlinePaymentAvailability=()=>{};export const startOnlineOrder=()=>{};";
    if (name === "@/integrations/supabase/client") source = "export const supabase={};";
    if (source)
      return { url: "data:text/javascript," + encodeURIComponent(source), shortCircuit: true };
    return next(name, context);
  },
});
const { Route } = await import("../src/routes/_authenticated/cliente.checkout.tsx");
hooks.deregister();
jsx.deregister();
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
