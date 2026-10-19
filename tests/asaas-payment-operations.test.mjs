import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const runtime = { data: { payments: [], unresolvedCount: 0 } };
globalThis.__paymentOperations = runtime;
const jsx = loadTsx();
const mocks = {
  "@tanstack/react-start": "export const useServerFn=x=>x;",
  "@tanstack/react-query": `export const useQuery=()=>({data:globalThis.__paymentOperations.data,isPending:false,error:null,refetch:async()=>{}});`,
  "@/lib/admin-asaas.functions": `export const getAsaasPayments=async()=>({payments:[],unresolvedCount:0});export const reconcileAsaasOrder=async()=>{};export const getAsaasOnlineStatus=async()=>({enabled:false,canEnable:false});export const setAsaasOnlineEnabled=async()=>{};export const diagnoseAsaasSandbox=async()=>{};`,
  "@/components/ui/button": 'export const Button="button";',
  sonner: "export const toast={error(){},success(){}};",
};
const hooks = registerHooks({
  resolve(n, c, next) {
    if (mocks[n])
      return { url: "data:text/javascript," + encodeURIComponent(mocks[n]), shortCircuit: true };
    return next(n, c);
  },
});
const badge = await import("../src/components/order-payment-badge.tsx").catch(() => null);
const admin = await import("../src/components/admin/asaas-payments.tsx").catch(() => null);
hooks.deregister();
jsx.deregister();
test.after(() => delete globalThis.__paymentOperations);
test("operational badge distinguishes paid online, unpaid delivery and financial review", () => {
  assert.ok(badge);
  const html = (p) => renderToStaticMarkup(React.createElement(badge.OrderPaymentBadge, p));
  assert.match(html({ channel: "asaas", state: "received" }), /Pago online/);
  assert.match(html({ channel: "delivery", state: null }), /Cobrar na entrega/);
  assert.match(html({ channel: "asaas", state: "refund_pending" }), /conferência/);
});
test("admin has a useful empty state without creating simulated or real charges", () => {
  assert.ok(admin);
  runtime.data = { payments: [], unresolvedCount: 0 };
  const html = renderToStaticMarkup(React.createElement(admin.AsaasPayments));
  assert.match(html, /Nenhum pagamento online/);
  assert.ok(!html.includes("Marcar como pago"));
});
test("cancelled paid orders remain visible in the independent payment queue", () => {
  assert.ok(admin);
  runtime.data = {
    payments: [
      {
        id: "attempt",
        order_id: "order",
        payment_id: "pay_fixture",
        environment: "production",
        external_reference: "pedetrem-fixture",
        value_cents: 1000,
        net_value_cents: 970,
        refunded_value_cents: 0,
        state: "refund_pending",
        order_status: "cancelled",
        created_at: "2026-10-19",
        issues: [{ kind: "refund_required", createdAt: "2026-10-19" }],
      },
    ],
    unresolvedCount: 1,
  };
  const html = renderToStaticMarkup(React.createElement(admin.AsaasPayments));
  assert.match(html, /Reembolso/);
  assert.match(html, /Conferir na Asaas/);
  assert.match(html, /pay_fixture/);
});
