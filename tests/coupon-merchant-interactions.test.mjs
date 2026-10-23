import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import React from "react";
import { loadTsx } from "./helpers/load-tsx.mjs";

// Keep the real route, event handlers, validator and guard; replace only framework/UI boundaries.
const runtime = {
  states: [],
  index: 0,
  cleanup: null,
  query: null,
  auth: null,
  calls: [],
  notices: [],
};
globalThis.__couponMerchantUI = runtime;
const userId = "11111111-1111-4111-8111-111111111111";
const storeId = "22222222-2222-4222-8222-222222222222";
const revision = "33333333-3333-4333-8333-333333333333";
const campaign = {
  id: "44444444-4444-4444-8444-444444444444",
  code: "TREM15",
  type: "percent",
  percent: 15,
  value_cents: 0,
  min_order_cents: 2000,
  max_discount_cents: 1000,
  used_count: 0,
  usage_limit: null,
  ativo: true,
  descricao: null,
  starts_at: null,
  expires_at: null,
  campaign_revision: revision,
  participating: false,
  requires_reacceptance: false,
  available: true,
};
runtime.supabase = {
  auth: {
    onAuthStateChange(callback) {
      runtime.auth = callback;
      return { data: { subscription: { unsubscribe() {} } } };
    },
  },
  rpc(name, args) {
    runtime.calls.push({ name, args });
    return runtime.rpcResult;
  },
};
const reactUrl = import.meta.resolve("react");
const source = (code) => ({
  url: "data:text/javascript," + encodeURIComponent(code),
  shortCircuit: true,
});
const jsx = loadTsx();
const boundaries = registerHooks({
  resolve(name, context, next) {
    if (name === "react" && context.parentURL?.includes("estabelecimento.cupons.tsx"))
      return source(`
      export * from ${JSON.stringify(reactUrl)};
      export const useState = initial => {const r=globalThis.__couponMerchantUI;const i=r.index++;
        if(!(i in r.states))r.states[i]=typeof initial==='function'?initial():initial;
        return [r.states[i], value=>{r.states[i]=typeof value==='function'?value(r.states[i]):value}];};
      export const useEffect = effect => {const r=globalThis.__couponMerchantUI;if(!r.cleanup)r.cleanup=effect();};
    `);
    if (name === "@tanstack/react-router")
      return source("export const createFileRoute=path=>options=>({options});");
    if (name === "@tanstack/react-query")
      return source(
        "export const useQuery=options=>{const r=globalThis.__couponMerchantUI;r.queryOptions=options;return r.query};",
      );
    if (name === "@/integrations/supabase/client")
      return source("export const supabase=globalThis.__couponMerchantUI.supabase;");
    if (name === "@/hooks/use-my-estab")
      return source(
        `export const useMyEstab=()=>({estab:{id:${JSON.stringify(storeId)},owner_id:${JSON.stringify(userId)}},userId:${JSON.stringify(userId)},isLoading:false});`,
      );
    if (name === "sonner")
      return source(
        "export const toast={success:message=>globalThis.__couponMerchantUI.notices.push({kind:'success',message}),error:message=>globalThis.__couponMerchantUI.notices.push({kind:'error',message})};",
      );
    if (name === "@/components/ui/button") return source('export const Button="button";');
    if (name === "@/components/ui/badge") return source('export const Badge="span";');
    if (name === "@/components/ui/dialog")
      return source(
        `export const Dialog=({open,children})=>open?children:null;export const DialogContent="section",DialogHeader="header",DialogTitle="h2",DialogDescription="p",DialogFooter="footer";`,
      );
    return next(name, context);
  },
});
const { Route } = await import("../src/routes/_authenticated/estabelecimento.cupons.tsx");
boundaries.deregister();
jsx.deregister();

function expand(node) {
  if (Array.isArray(node)) return node.map(expand);
  if (!React.isValidElement(node)) return node;
  if (typeof node.type === "function") return expand(node.type(node.props));
  return { type: node.type, props: node.props, children: expand(node.props.children) };
}
function render() {
  runtime.index = 0;
  return expand(Route.options.component());
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (node && typeof node === "object") return text(node.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function button(tree, label) {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const match = button(child, label);
      if (match) return match;
    }
  } else if (tree && typeof tree === "object") {
    if (tree.type === "button" && text(tree).trim() === label) return tree;
    return button(tree.children, label);
  }
  return null;
}
async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

test.beforeEach(() => {
  runtime.cleanup?.();
  runtime.states = [];
  runtime.index = 0;
  runtime.cleanup = null;
  runtime.calls = [];
  runtime.notices = [];
  runtime.refetchCount = 0;
  runtime.query = {
    data: [{ ...campaign }],
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: async () => {
      runtime.refetchCount += 1;
    },
  };
  runtime.rpcResult = Promise.resolve({
    data: { participating: true, campaign_revision: revision, accepted_at: "2030-01-01T00:00:00Z" },
    error: null,
  });
});
test.after(() => {
  runtime.cleanup?.();
  delete globalThis.__couponMerchantUI;
});

test("opening and cancelling financial confirmation never opts a store in", () => {
  let tree = render();
  assert.deepEqual(runtime.queryOptions.queryKey, ["merchant-coupon-campaigns", userId, storeId]);
  assert.equal(runtime.calls.length, 0);
  assert.equal(button(tree, "Confirmar adesão"), null);
  button(tree, "Conferir e aderir").props.onClick();
  tree = render();
  assert.match(
    text(tree).replace(/\s+/g, " "),
    /O desconto é custeado pela sua loja e reduz seu repasse; comissão segue regras existentes\./,
  );
  assert.ok(button(tree, "Confirmar adesão"));
  assert.equal(runtime.calls.length, 0);
  button(tree, "Cancelar").props.onClick();
  assert.equal(button(render(), "Confirmar adesão"), null);
  assert.equal(runtime.calls.length, 0);
});

test("confirmation sends exactly one participation request even before a pending rerender", async () => {
  button(render(), "Conferir e aderir").props.onClick();
  const confirm = button(render(), "Confirmar adesão");
  confirm.props.onClick();
  confirm.props.onClick();
  assert.equal(runtime.calls.length, 1);
  assert.deepEqual(runtime.calls[0], {
    name: "set_coupon_participation",
    args: {
      p_establishment_id: storeId,
      p_coupon_id: campaign.id,
      p_revision: revision,
      p_participating: true,
    },
  });
  assert.equal(button(render(), "Confirmando…").props.disabled, true);
  await flush();
  assert.equal(runtime.notices.filter((notice) => notice.kind === "success").length, 1);
});

test("a changed revision requires a fresh review and never silently accepts new conditions", async () => {
  button(render(), "Conferir e aderir").props.onClick();
  runtime.query.data = [{ ...campaign, campaign_revision: userId }];
  button(render(), "Confirmar adesão").props.onClick();
  await flush();
  assert.equal(runtime.calls.length, 0);
  assert.equal(runtime.refetchCount, 1);
  assert.equal(button(render(), "Confirmar adesão"), null);
  assert.match(runtime.notices[0].message, /condições mudaram/);
});

test("old auth and unmounted request completions never publish success to another session", async () => {
  let resolve;
  runtime.rpcResult = new Promise((finish) => {
    resolve = finish;
  });
  button(render(), "Conferir e aderir").props.onClick();
  button(render(), "Confirmar adesão").props.onClick();
  runtime.auth("SIGNED_OUT", null);
  resolve({
    data: { participating: true, campaign_revision: revision, accepted_at: "2030-01-01T00:00:00Z" },
    error: null,
  });
  await flush();
  assert.equal(runtime.notices.length, 0);
  assert.equal(runtime.refetchCount, 0);
  assert.match(text(render()), /sessão mudou/);
});

test("an already captured confirmation handler cannot start a request after sign-out", () => {
  button(render(), "Conferir e aderir").props.onClick();
  const confirm = button(render(), "Confirmar adesão");
  runtime.auth("SIGNED_OUT", null);
  confirm.props.onClick();
  assert.equal(runtime.calls.length, 0);
});

test("paused campaigns retain a safe way for an existing participant to leave", async () => {
  runtime.query.data = [{ ...campaign, participating: true, available: false, ativo: false }];
  runtime.rpcResult = Promise.resolve({
    data: { participating: false, campaign_revision: userId, accepted_at: null },
    error: null,
  });
  const tree = render();
  assert.equal(button(tree, "Conferir e aderir"), null);
  button(tree, "Sair da campanha").props.onClick();
  await flush();
  assert.equal(runtime.calls[0].args.p_participating, false);
  assert.equal(runtime.notices[0].kind, "success");
});

test("legacy zero limits display their actual terms instead of promising unlimited benefit", () => {
  runtime.query.data = [
    { ...campaign, participating: true, available: false, max_discount_cents: 0, usage_limit: 0 },
  ];
  const content = text(render());
  assert.match(content, /0\s+de 0/);
  assert.doesNotMatch(content, /Sem teto adicional|sem limite/);
});
