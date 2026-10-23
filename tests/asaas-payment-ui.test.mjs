import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const runtime = { refs: [], index: 0, states: [], stateIndex: 0 };
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
            `export * from ${JSON.stringify(react)};export const useRef=x=>{const r=globalThis.__paymentUI;return r.refs[r.index++]??={current:x}};export const useState=x=>{const r=globalThis.__paymentUI;const i=r.stateIndex++;if(!(i in r.states))r.states[i]=x;return [r.states[i],v=>{r.states[i]=typeof v==="function"?v(r.states[i]):v}]};`,
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
test.beforeEach(() => {
  runtime.refs = [];
  runtime.index = 0;
  runtime.states = [];
  runtime.stateIndex = 0;
});
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

const cardFixture = { id: "11111111-1111-4111-8111-111111111111", brand: "VISA", last4: "1111" };
const payerEntries = {
  name: "Fixture",
  cpfCnpj: "24971563792",
  email: "fixture@example.invalid",
  phone: "47999999999",
  postalCode: "89223005",
  addressNumber: "277",
};
const cardEntries = {
  holderName: "Fixture",
  number: "4111111111111111",
  expiryMonth: "12",
  expiryYear: "2035",
  ccv: "123",
};
function walk(tree, predicate) {
  if (!tree || typeof tree !== "object") return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props?.children)) {
    const found = walk(child, predicate);
    if (found) return found;
  }
  return null;
}
function renderForm(props) {
  runtime.index = 0;
  runtime.stateIndex = 0;
  return form.OnlinePaymentForm({ method: "cartao", busy: false, ...props });
}
async function submitEntries(tree, entries) {
  const old = globalThis.FormData;
  globalThis.FormData = class {
    get(k) {
      return entries[k] ?? null;
    }
  };
  try {
    await tree.props.onSubmit({ preventDefault() {}, currentTarget: { reset() {} } });
  } finally {
    globalThis.FormData = old;
  }
}
test("a new card is never saved unless the customer explicitly checks consent", async () => {
  const sent = [];
  let tree = renderForm({ onSubmit: async (...args) => sent.push(args) });
  const consent = walk(tree, (n) => n.type === "input" && n.props.name === "saveCard");
  assert.ok(consent, "new card includes explicit save consent");
  assert.ok(!consent.props.defaultChecked && !consent.props.checked);
  await submitEntries(tree, { ...payerEntries, ...cardEntries });
  assert.deepEqual(sent[0][2], { saveCard: false });
  tree = renderForm({ onSubmit: async (...args) => sent.push(args) });
  await submitEntries(tree, { ...payerEntries, ...cardEntries, saveCard: "on" });
  assert.deepEqual(sent[1][2], { saveCard: true });
});
test("a saved card selection shows safe metadata and submits without PAN, expiry or CVV", async () => {
  let sent;
  const props = {
    savedCards: [cardFixture],
    onSubmit: async (...args) => {
      sent = args;
    },
  };
  let tree = renderForm(props);
  const choice = walk(tree, (n) => n.type === "input" && n.props.value === cardFixture.id);
  assert.ok(choice, "safe saved-card option is available");
  choice.props.onChange();
  tree = renderForm(props);
  for (const name of ["number", "holderName", "expiryMonth", "expiryYear", "ccv", "saveCard"])
    assert.equal(
      walk(tree, (n) => n.type === "input" && n.props.name === name),
      null,
      name,
    );
  const html = renderToStaticMarkup(tree);
  assert.match(html, /VISA/);
  assert.match(html, /1111/);
  assert.ok(!html.includes("4111111111111111"));
  await submitEntries(tree, payerEntries);
  assert.equal(sent[1], undefined);
  assert.deepEqual(sent[2], { savedCardId: cardFixture.id });
});
test("saved-card removal is an explicit action and never submits the payment form", async () => {
  const removed = [];
  const tree = renderForm({
    savedCards: [cardFixture],
    onSubmit: async () => assert.fail("no payment"),
    onRemoveCard: async (id) => removed.push(id),
  });
  const remove = walk(tree, (n) => n.props?.["aria-label"] === "Remover cartão VISA final 1111");
  assert.ok(remove);
  assert.equal(remove.props.type, "button");
  assert.deepEqual(removed, []);
  await remove.props.onClick();
  assert.deepEqual(removed, [cardFixture.id]);
});
test("saved-card load failure offers a retry while keeping a new card available", () => {
  let retries = 0;
  const tree = renderForm({
    cardsError: "Não foi possível carregar seus cartões.",
    onRetryCards: () => retries++,
    onSubmit: async () => {},
  });
  const retry = walk(
    tree,
    (n) =>
      n.props?.onClick && React.Children.toArray(n.props.children).includes("Tentar novamente"),
  );
  assert.ok(retry);
  retry.props.onClick();
  assert.equal(retries, 1);
  assert.ok(walk(tree, (n) => n.type === "input" && n.props.name === "number"));
});
test("disabled payment blocks submit and card management", async () => {
  const tree = renderForm({
    disabled: true,
    savedCards: [cardFixture],
    onRemoveCard: async () => {},
    onSubmit: async () => assert.fail("disabled payment"),
  });
  assert.equal(walk(tree, (n) => n.type === "fieldset").props.disabled, true);
  const remove = walk(tree, (n) => n.props?.["aria-label"] === "Remover cartão VISA final 1111");
  assert.ok(remove);
  assert.equal(remove.props.disabled, true);
  await submitEntries(tree, { ...payerEntries, ...cardEntries });
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

test("payer defaults prefill editable account and billing fields without overwriting payer edits", () => {
  const props = { payerDefaults: payerEntries, onSubmit: async () => {} };
  let tree = renderForm(props);
  const input = (name) => walk(tree, (n) => n.type === "input" && n.props.name === name);
  assert.equal(input("name").props.value, "Fixture");
  assert.equal(input("email").props.value, "fixture@example.invalid");
  assert.equal(input("phone").props.value, "47999999999");
  assert.equal(input("postalCode").props.value, "89223005");
  assert.equal(input("addressNumber").props.value, "277");
  input("name").props.onChange({ target: { value: "Outro pagador" } });
  tree = renderForm({
    ...props,
    payerDefaults: { ...payerEntries, name: "Updated account", phone: "47988888888" },
  });
  assert.equal(input("name").props.value, "Outro pagador");
  assert.equal(input("phone").props.value, "47988888888");
  assert.equal(input("cpfCnpj").props.required, true);
});

test("saved-card payment needs no billing fields and omits stale billing data from its payer", async () => {
  let sent;
  const props = {
    savedCards: [cardFixture],
    payerDefaults: payerEntries,
    onSubmit: async (...args) => {
      sent = args;
    },
  };
  let tree = renderForm(props);
  walk(tree, (n) => n.type === "input" && n.props.value === cardFixture.id).props.onChange();
  tree = renderForm(props);
  for (const name of ["postalCode", "addressNumber", "number", "expiryMonth", "expiryYear", "ccv"])
    assert.equal(
      walk(tree, (n) => n.type === "input" && n.props.name === name),
      null,
      name,
    );
  await submitEntries(tree, payerEntries);
  assert.deepEqual(sent[0], {
    name: "Fixture",
    cpfCnpj: "24971563792",
    email: "fixture@example.invalid",
    phone: "47999999999",
  });
  assert.deepEqual(sent[2], { savedCardId: cardFixture.id });
});

test("new-card provider fields remain required and disappeared saved cards cannot be submitted", async () => {
  let sent = false;
  let errors = 0;
  const props = {
    savedCards: [cardFixture],
    onSubmit: async () => {
      sent = true;
    },
    onError: () => errors++,
  };
  let tree = renderForm(props);
  walk(tree, (n) => n.type === "input" && n.props.value === cardFixture.id).props.onChange();
  tree = renderForm({ ...props, savedCards: [] });
  for (const name of [
    "cpfCnpj",
    "postalCode",
    "addressNumber",
    "number",
    "holderName",
    "expiryMonth",
    "expiryYear",
    "ccv",
  ])
    assert.equal(
      walk(tree, (n) => n.type === "input" && n.props.name === name).props.required,
      true,
      name,
    );
  await submitEntries(tree, payerEntries);
  assert.equal(sent, false);
  assert.equal(errors, 1);
});
