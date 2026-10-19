import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const runtime = {};
globalThis.__paymentAuth = runtime;
const modules = {
  "@tanstack/react-start": `const flatten=entries=>entries.flatMap(m=>[...flatten(m.parents??[]),m.fn]);export function createMiddleware(){const m={parents:[]};return {middleware(p){m.parents=p;return this},server(fn){return {...m,fn}}}}export function createServerFn(){let middleware=[],validate=x=>x;return {middleware(m){middleware=m;return this},validator(v){validate=v;return this},handler(fn){return async input=>{const steps=flatten(middleware);const run=async(i,c)=>i===steps.length?fn({context:c,data:validate(input?.data)}):steps[i]({context:c,next:v=>run(i+1,{...c,...v?.context})});return run(0,{})}}}}`,
  "@tanstack/react-start/server": `export const getRequest=()=>new Request('https://app.example.test',{headers:{'x-vercel-forwarded-for':'192.0.2.1'}});`,
  "@/integrations/supabase/auth-middleware": `export const requireSupabaseAuth={fn:({next})=>next({context:globalThis.__paymentAuth.context})};`,
  "./asaas-payment-store.server": `export const paymentStore={view:async()=>globalThis.__paymentAuth.work()};export const paymentRpc=(...a)=>globalThis.__paymentAuth.work(...a);export const paymentContext=async()=>null;`,
  "./asaas-payment-service.server": `export const createPaymentService=()=>({runPaymentAttempt:async()=>globalThis.__paymentAuth.work(),reconcilePayment:async()=>globalThis.__paymentAuth.work()});`,
  "./checkout.functions": `import {z} from 'zod';export const placeOrderInput=z.object({establishment_id:z.string().uuid(),idempotency_key:z.string().uuid(),forma_pagamento:z.enum(['pix','cartao','dinheiro']),expected_total_cents:z.number(),test_mode:z.boolean().default(false)});`,
};
const hooks = registerHooks({
  resolve(n, c, next) {
    if (n === "zod" && c.parentURL?.startsWith("data:"))
      return next(n, { ...c, parentURL: import.meta.url });
    if (modules[n])
      return { url: "data:text/javascript," + encodeURIComponent(modules[n]), shortCircuit: true };
    if (n.startsWith("./") && c.parentURL?.includes("/src/lib/") && !/\.[a-z]+$/.test(n))
      return next(n + ".ts", c);
    return next(n, c);
  },
});
const handlers = await import("../src/lib/asaas-payment.functions.ts").catch((e) => {
  console.error(e.message);
  return null;
});
test.after(() => {
  hooks.deregister();
  delete globalThis.__paymentAuth;
});
function reset() {
  runtime.calls = 0;
  runtime.user = { id: "user", email_confirmed_at: "confirmed" };
  runtime.role = true;
  runtime.context = {
    userId: "user",
    supabase: {
      auth: { getUser: async () => ({ data: { user: runtime.user }, error: null }) },
      rpc: async () => ({ data: runtime.role, error: null }),
    },
  };
  runtime.work = async () => {
    runtime.calls++;
    return { enabled: false };
  };
}
test("every payment handler requires a fresh existing confirmed matching user", async () => {
  assert.ok(handlers);
  for (const name of [
    "getOnlinePaymentAvailability",
    "startOnlineOrder",
    "retryOnlinePayment",
    "getOnlinePayment",
    "refreshOnlinePayment",
    "cancelOnlinePayment",
  ])
    for (const user of [
      null,
      { id: "other", email_confirmed_at: "yes" },
      { id: "user", email_confirmed_at: null },
    ]) {
      reset();
      runtime.user = user;
      await assert.rejects(handlers[name]({ data: {} }), /Unauthorized/);
      assert.equal(runtime.calls, 0);
    }
});
test("online checkout rejects a different role, Sandbox selection and simulated purchases", async () => {
  assert.ok(handlers);
  reset();
  runtime.role = false;
  await assert.rejects(handlers.startOnlineOrder({ data: {} }), /Forbidden/);
  assert.equal(runtime.calls, 0);
  reset();
  for (const bad of [
    { environment: "sandbox" },
    { checkout: { test_mode: true } },
    { payer: { cpfCnpj: "PRIVATEINVALID" } },
  ]) {
    await assert.rejects(
      handlers.startOnlineOrder({ data: bad }),
      (e) => !e.message.includes("PRIVATEINVALID"),
    );
    assert.equal(runtime.calls, 0);
  }
});
