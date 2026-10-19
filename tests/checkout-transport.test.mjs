import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const stub = `export function createServerFn(){let parse=(x)=>x;return {middleware(){return this},validator(fn){parse=fn;return this},handler(fn){return ({data,context})=>fn({data:parse(data),context})}}}`;
const hooks = registerHooks({
  resolve(name, context, next) {
    if (name === "@tanstack/react-start")
      return { url: "data:text/javascript," + encodeURIComponent(stub), shortCircuit: true };
    if (name === "@/integrations/supabase/auth-middleware")
      return {
        url: "data:text/javascript,export const requireSupabaseAuth={};",
        shortCircuit: true,
      };
    if (name === "@/lib/commerce")
      return { url: new URL("../src/lib/commerce.ts", import.meta.url).href, shortCircuit: true };
    return next(name, context);
  },
});
const { placeOrder, quoteOrder } = await import("../src/lib/checkout.functions.ts");
hooks.deregister();
const uuid = "10000000-0000-4000-8000-000000000001";
const input = {
  establishment_id: uuid,
  forma_pagamento: "dinheiro",
  tipo_entrega: "pickup",
  idempotency_key: uuid,
  expected_total_cents: 1000,
};

test("checkout uses one RPC with a checked total and a stable retry key", async () => {
  const calls = [];
  const context = {
    supabase: {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: { order_id: uuid, total_cents: 1000, desconto_cents: 0 }, error: null };
      },
    },
  };
  await placeOrder({ data: input, context });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "checkout_order");
  assert.equal(calls[0].args.p_observacoes ?? null, null);
  assert.equal(calls[0].args.p_coupon_code ?? null, null);
  assert.equal(calls[0].args.p_endereco, null);
  assert.equal(calls[0].args.p_idempotency_key, uuid);
  assert.equal(calls[0].args.p_expected_total_cents, 1000);
});
test("wallet is rejected before calling the database", async () => {
  let invoked = false;
  await assert.rejects(async () =>
    placeOrder({
      data: { ...input, forma_pagamento: "carteira" },
      context: {
        supabase: {
          rpc() {
            invoked = true;
          },
        },
      },
    }),
  );
  assert.equal(invoked, false);
});
test("quote returns the authoritative discount/total and validates the database response", async () => {
  const quote = {
    subtotal_cents: 1000,
    frete_cents: 500,
    desconto_cents: 500,
    total_cents: 1000,
  };
  const result = await quoteOrder({
    data: {
      establishment_id: uuid,
      idempotency_key: uuid,
      forma_pagamento: "pix",
      tipo_entrega: "delivery",
      coupon_code: "TEST",
      endereco: { rua: "Rua de teste", cidade: "Cidade teste" },
    },
    context: {
      supabase: {
        rpc: async (name, args) => {
          assert.equal(name, "quote_order");
          assert.equal(args.p_coupon_code, "TEST");
          return { data: quote, error: null };
        },
      },
    },
  });
  assert.deepEqual(result, quote);
});
test("explicit test purchases use the scoped test RPC, never the normal payment path", async () => {
  let selected;
  await placeOrder({
    data: { ...input, forma_pagamento: "pix", test_mode: true },
    context: {
      supabase: {
        rpc: async (name) => {
          selected = name;
          return { data: { order_id: uuid, total_cents: 1000, desconto_cents: 0 }, error: null };
        },
      },
    },
  });
  assert.equal(selected, "checkout_test_order");
});
