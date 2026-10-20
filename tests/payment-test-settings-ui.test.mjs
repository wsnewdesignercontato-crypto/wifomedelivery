import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";
const r = { states: [], cursor: 0 };
globalThis.__simulatorUI = r;
const jsx = loadTsx();
const modules = {
  react: `const r=globalThis.__simulatorUI;export const useState=v=>{const i=r.cursor++;if(!(i in r.states))r.states[i]=v;return[r.states[i],v=>r.states[i]=v]};export const useRef=v=>{const i=r.cursor++;return r.states[i]??={current:v}};`,
  "@tanstack/react-query": `const r=globalThis.__simulatorUI;export const useQuery=()=>({data:r.data,isLoading:false});export const useQueryClient=()=>({setQueryData(k,v){r.data=v}});`,
  "@/integrations/supabase/client": `export const supabase={rpc:(n,p)=>globalThis.__simulatorUI.rpc(n,p)};`,
  "@/components/ui/button": "export const Button='button';",
  "@/components/ui/input": "export const Input='input';",
  "@/components/ui/label": "export const Label='label';",
  "@/components/ui/switch": "export const Switch='input';",
  "@/components/ui/dialog":
    "export const Dialog='dialog',DialogContent='div',DialogHeader='header',DialogTitle='h3',DialogDescription='p',DialogFooter='footer';",
  "@/lib/format": "export const brl=n=>String(n);",
  sonner:
    "const r=globalThis.__simulatorUI;export const toast={success:m=>r.messages.push(m),error:m=>r.messages.push(m)};",
};
const hooks = registerHooks({
  resolve(n, c, next) {
    if (n === "react" && !c.parentURL?.endsWith("/payment-test-settings.tsx")) return next(n, c);
    return modules[n]
      ? { url: "data:text/javascript," + encodeURIComponent(modules[n]), shortCircuit: true }
      : next(n, c);
  },
});
const { PaymentTestSettings } = await import("../src/components/admin/payment-test-settings.tsx");
hooks.deregister();
jsx.deregister();
const admin = "94000000-0000-4000-8000-000000000001",
  store = "94000000-0000-4000-8000-000000000004";
function nodes(n) {
  return n && typeof n === "object"
    ? [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)]
    : [];
}
function text(n) {
  return typeof n === "string"
    ? n
    : n && typeof n === "object"
      ? [n.props?.children].flat(Infinity).map(text).join(" ")
      : "";
}
function mount() {
  Object.assign(r, {
    states: [],
    cursor: 0,
    messages: [],
    calls: [],
    fail: false,
    data: {
      enabled: true,
      admin_id: admin,
      count: 0,
      customers: [{ id: admin, nome: "Admin" }],
      stores: [{ id: store, nome: "Shop", cidade: "City", estado: null, is_open: true }],
      couriers: [],
      testers: [],
      sales: [],
    },
  });
  r.rpc = async (n, p) => {
    r.calls.push([n, p]);
    return r.fail ? { error: { message: "Temporary failure" } } : { data: r.data, error: null };
  };
  const render = () => {
    r.cursor = 0;
    return PaymentTestSettings();
  };
  const change = (id, value) =>
    nodes(render())
      .find((n) => n.props?.id === id)
      .props.onChange({ target: { value } });
  return {
    render,
    change,
    submit: () =>
      nodes(render())
        .find((n) => n.type === "form")
        .props.onSubmit({ preventDefault() {} }),
  };
}
test("direct generation submits an atomic order command and retains its key on retry", async () => {
  const app = mount();
  app.change("test-store", store);
  assert.match(text(app.render()), /Gerar pedido de teste/);
  r.fail = true;
  await app.submit();
  assert.equal(r.calls[0][0], "admin_generate_test_order");
  assert.equal(r.calls[0][1].p_subtotal_cents, 2900);
  assert.equal(r.calls[0][1].p_customer_id, admin);
  assert.equal(r.calls[0][1].p_courier_id, null);
  r.fail = false;
  await app.submit();
  assert.equal(r.calls[1][1].p_request_key, r.calls[0][1].p_request_key);
  await app.submit();
  assert.notEqual(r.calls[2][1].p_request_key, r.calls[1][1].p_request_key);
});
test("rapid double submission generates one request and enrollment remains a separate action", async () => {
  const app = mount();
  app.change("test-store", store);
  let resolve;
  r.rpc = (n, p) => {
    r.calls.push([n, p]);
    return new Promise((done) => (resolve = () => done({ data: r.data, error: null })));
  };
  const pending = app.submit();
  await app.submit();
  assert.equal(r.calls.length, 1);
  resolve();
  await pending;
  r.rpc = async (n, p) => {
    r.calls.push([n, p]);
    return { data: r.data, error: null };
  };
  const enroll = nodes(app.render()).find(
    (n) => n.type === "button" && text(n).includes("Liberar compra pelo app"),
  );
  assert.ok(enroll);
  await enroll.props.onClick();
  assert.equal(r.calls.at(-1)[0], "admin_payment_test");
  assert.equal(r.calls.at(-1)[1].p_action, "enroll");
});
test("courier test has its own explicit action and uses a separate retry identity", async () => {
  const app = mount();
  app.change("test-store", store);
  const button = () =>
    nodes(app.render()).find(
      (n) => n.type === "button" && text(n).includes("Gerar corrida de teste"),
    );
  assert.ok(button());
  assert.equal(button().props.disabled, true);
  app.change("test-courier", admin);
  assert.equal(button().props.disabled, false);
  r.fail = true;
  await app.submit();
  const orderKey = r.calls[0][1].p_request_key;
  await button().props.onClick();
  assert.equal(r.calls[1][0], "admin_generate_test_ride");
  assert.notEqual(r.calls[1][1].p_request_key, orderKey);
  const rideKey = r.calls[1][1].p_request_key;
  r.fail = false;
  await button().props.onClick();
  assert.equal(r.calls[2][1].p_request_key, rideKey);
  assert.match(r.messages.at(-1), /Corrida de teste/);
});
