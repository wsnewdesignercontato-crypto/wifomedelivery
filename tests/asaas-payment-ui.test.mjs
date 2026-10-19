import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const runtime = { refs: [], index: 0 };
globalThis.__paymentUI = runtime;
const jsx = loadTsx();
const react = import.meta.resolve("react");
const hooks = registerHooks({
  resolve(n, c, next) {
    if (n === "react" && c.parentURL?.includes("/components/checkout/"))
      return {
        url:
          "data:text/javascript," +
          encodeURIComponent(
            `export * from ${JSON.stringify(react)};export const useRef=x=>{const r=globalThis.__paymentUI;return r.refs[r.index++]??={current:x}};`,
          ),
        shortCircuit: true,
      };
    if (n === "@/components/ui/button")
      return { url: 'data:text/javascript,export const Button="button"', shortCircuit: true };
    return next(n, c);
  },
});
const form = await import("../src/components/checkout/online-payment-form.tsx").catch(() => null);
const panel = await import("../src/components/checkout/order-payment-panel.tsx").catch(() => null);
hooks.deregister();
jsx.deregister();
test.after(() => delete globalThis.__paymentUI);
const payment = {
  orderId: "order",
  channel: "asaas",
  state: "uncertain",
  totalCents: 1000,
  expiresAt: "2030-01-01",
  paidAt: null,
  pix: null,
  canRetry: false,
  message: "",
};
test("uncertain payment has refresh and cancellation but no retry action", () => {
  assert.ok(panel);
  const html = renderToStaticMarkup(
    React.createElement(panel.OrderPaymentPanel, {
      payment,
      busy: false,
      onRefresh() {},
      onRetry() {},
      onCancel() {},
    }),
  );
  assert.match(html, /Conferindo|conferir/);
  assert.ok(!html.includes("Tentar novo pagamento"));
  assert.ok(!html.includes("<iframe"));
});
test("Pix has a QR and a selectable copy-and-paste alternative", () => {
  assert.ok(panel);
  const html = renderToStaticMarkup(
    React.createElement(panel.OrderPaymentPanel, {
      payment: {
        ...payment,
        state: "pending",
        pix: { encodedImage: "YWJj", payload: "000201fixture", expirationDate: "2030-01-01" },
      },
      busy: false,
      onRefresh() {},
      onCancel() {},
    }),
  );
  assert.match(html, /000201fixture/);
  assert.match(html, /data:image\/png;base64,YWJj/);
  assert.match(html, /readOnly|readonly/);
});
test("payment form sends once and clears private fields immediately after explicit submit", async () => {
  assert.ok(form);
  runtime.refs = [];
  runtime.index = 0;
  let release,
    calls = 0,
    resets = 0;
  const submit = () => {
    calls++;
    return new Promise((r) => (release = r));
  };
  const tree = form.OnlinePaymentForm({ method: "cartao", busy: false, onSubmit: submit });
  assert.equal(calls, 0);
  const entries = {
    name: "Fixture",
    cpfCnpj: "24971563792",
    email: "fixture@example.invalid",
    phone: "47999999999",
    postalCode: "89223005",
    addressNumber: "277",
    holderName: "Fixture",
    number: "4111111111111111",
    expiryMonth: "12",
    expiryYear: "2035",
    ccv: "123",
  };
  const old = globalThis.FormData;
  globalThis.FormData = class {
    get(k) {
      return entries[k] ?? "";
    }
  };
  try {
    const event = {
      preventDefault() {},
      currentTarget: {
        reset() {
          resets++;
        },
      },
    };
    const first = tree.props.onSubmit(event);
    await tree.props.onSubmit(event);
    assert.equal(calls, 1);
    assert.ok(resets >= 1);
    release();
    await first;
  } finally {
    globalThis.FormData = old;
  }
});
