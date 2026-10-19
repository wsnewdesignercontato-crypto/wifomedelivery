import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { deliveryPoint, haversineKm } from "../src/lib/map-utils.ts";
const source = await readFile(
  new URL("../src/components/entregador/new-ride-offer.tsx", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile(
  "offer.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let evaluateSource;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "evaluate")
    evaluateSource = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(evaluateSource);
const js = ts.transpile(evaluateSource, { target: ts.ScriptTarget.ES2022 });
async function offerFor(coordinates) {
  let offer = null;
  const store = {
    id: "store",
    nome: "Loja teste",
    endereco: "Rua Teste, 10",
    cidade: "São Sebastião do Paraíso",
    estado: "MG",
    ...coordinates,
  };
  const candidate = { id: "ride", order_id: "order", valor_entrega_cents: 500 };
  const client = {
    from(table) {
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        not() {
          return q;
        },
        or() {
          return q;
        },
        order() {
          return q;
        },
        limit() {
          return q;
        },
        async maybeSingle() {
          return {
            data:
              table === "deliveries"
                ? null
                : table === "orders"
                  ? {
                      id: "order",
                      cliente_id: "customer",
                      establishment_id: "store",
                      total_cents: 2000,
                      forma_pagamento: "pix",
                      endereco_entrega: { rua: "Rua Destino", lat: -20.93, lng: -46.99 },
                    }
                  : table === "establishments"
                    ? store
                    : { nome: "Cliente" },
          };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: table === "deliveries" ? [candidate] : [] }).then(
            resolve,
            reject,
          );
        },
      };
      return q;
    },
  };
  const run = vm.runInNewContext(js + ";evaluate;", {
    cancelled: false,
    sequence: 0,
    courier: { user_id: "courier" },
    supabase: client,
    dismissedIds: new Set(),
    myPos: { lat: -20.94, lng: -47 },
    setOffer: (x) => {
      offer = x;
    },
    stopRideRingtone() {},
    deliveryPoint,
    cleanPart: (value) =>
      String(value ?? "")
        .trim()
        .replace(/\s+/g, " "),
    fmtEndereco: () => "Rua Destino",
    distanceKm: (a, b) => Math.round(haversineKm(a, b) * 10) / 10,
    MAX_DELIVERY_DISTANCE_KM: 150,
    console: { warn() {} },
  });
  await run();
  return offer;
}
test("an offer reaches the courier when the approved store has an address but no GPS coordinates", async () => {
  const offer = await offerFor({ lat: null, lng: null });
  assert.equal(offer.deliveryId, "ride");
  assert.equal(offer.pickup.lat, null);
  assert.equal(offer.pickup.lng, null);
  assert.equal(offer.pickup.endereco, "Rua Teste, 10, São Sebastião do Paraíso, MG");
  assert.equal(offer.distanciaColeta, null);
  assert.equal(offer.distanciaEntrega, null);
});
test("invalid store coordinates do not invent a pickup point or silently drop an address-only offer", async () => {
  const offer = await offerFor({ lat: 0, lng: 0 });
  assert.equal(offer.deliveryId, "ride");
  assert.equal(offer.pickup.lat, null);
});
test("valid stored pickup coordinates preserve the computed route distances", async () => {
  const offer = await offerFor({ lat: "-20.94", lng: "-47" });
  assert.equal(offer.pickup.lat, -20.94);
  assert.equal(offer.distanciaColeta, 0);
  assert.ok(offer.distanciaEntrega > 0);
});
