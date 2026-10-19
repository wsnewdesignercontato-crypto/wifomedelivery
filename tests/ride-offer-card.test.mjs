import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { loadTsx } from "./helpers/load-tsx.mjs";
const jsx = loadTsx();
const mocks = {
  "@/components/open-street-map": `import {createElement} from ${JSON.stringify(import.meta.resolve("react"))};export default ()=>createElement('div',{'aria-label':'Mapa de demonstração',style:{height:'100%',background:'#e6eee8',display:'grid',placeItems:'center',color:'#64746a',fontSize:'12px'}},'Mapa da coleta e entrega');`,
  "@/components/ui/dialog": `export const Dialog='div',DialogContent='section',DialogTitle='h2',DialogDescription='p';`,
  "@/integrations/supabase/client": `export const supabase={};`,
  "@tanstack/react-router": `export const useNavigate=()=>()=>{};`,
};
const hooks = registerHooks({
  resolve(n, c, next) {
    if (mocks[n])
      return { url: "data:text/javascript," + encodeURIComponent(mocks[n]), shortCircuit: true };
    return next(n, c);
  },
});
const { RideOfferCard } = await import("../src/components/entregador/new-ride-offer.tsx");
hooks.deregister();
jsx.deregister();
export const fixtureOffer = {
  is_test: true,
  deliveryId: "fixture",
  orderId: "fixture",
  valorCents: 1250,
  totalPedidoCents: 3900,
  formaPagamento: "pix",
  pickup: {
    lat: null,
    lng: null,
    nome: "Hamburgueria Central",
    endereco: "Avenida das Flores, 250, Centro, São Paulo, SP",
  },
  dropoff: {
    lat: null,
    lng: null,
    endereco: "Rua das Palmeiras, 1180, Jardim Primavera, São Paulo, SP",
    bairro: "Jardim Primavera",
    complemento: "Bloco 2, apartamento 304",
    referencia: "Portaria principal",
  },
  cliente: { nome: "Cliente de demonstração", telefone: "11999990000" },
  distanciaColeta: 1.2,
  distanciaEntrega: 2.8,
  observacoes: "Pedido de demonstração. Não preparar produtos nem realizar entrega.",
};
export function renderRideFixture({
  accepting = false,
  canAccept = true,
  offer = fixtureOffer,
} = {}) {
  return renderToStaticMarkup(
    createElement(RideOfferCard, {
      offer,
      myPos: null,
      offerMarkers: [],
      distanciaColetaLive: 1.2,
      totalKm: 4,
      eta: 3,
      accepting,
      canAccept,
      aceitar() {},
      recusar() {},
    }),
  );
}
test("ride card shows separate earnings, pickup, dropoff and persistent actions", () => {
  const html = renderRideFixture();
  for (const value of [
    "Você recebe",
    "12,50",
    "Hamburgueria Central",
    "Cliente de demonstração",
    "GPS coleta",
    "GPS entrega",
    "Aceitar corrida",
    "Recusar",
  ])
    assert.ok(html.includes(value), value);
  assert.ok(html.includes("overflow-x-hidden"));
  assert.ok(html.includes("min-h-0"));
  assert.ok(html.includes("shrink-0"));
  assert.equal((html.match(/aria-label="Recusar"/g) || []).length, 1);
});
test("acceptance remains disabled while pending or without courier approval", () => {
  for (const props of [{ accepting: true }, { canAccept: false }]) {
    const html = renderRideFixture(props);
    assert.match(html, /disabled=""/);
    if (props.accepting) assert.ok(html.includes("Aceitando"));
  }
});
