import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";

const runtime = { states: [], cursor: 0, effects: [] };
globalThis.__cartOffersTest = runtime;
const jsx = loadTsx();
const react = import.meta.resolve("react");
const modules = {
  react: `export * from ${JSON.stringify(react)};const r=globalThis.__cartOffersTest;
    export function useState(initial){const i=r.cursor++;if(!(i in r.states))r.states[i]=typeof initial==='function'?initial():initial;return[r.states[i],value=>r.states[i]=typeof value==='function'?value(r.states[i]):value]}
    export function useEffect(fn,deps){const i=r.cursor++;const old=r.states[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){const s={deps};r.states[i]=s;r.effects.push(()=>{old?.cleanup?.();s.cleanup=fn()})}}`,
  "@tanstack/react-router": `const r=globalThis.__cartOffersTest;export const createFileRoute=()=>options=>({...options,useRouteContext:()=>({user:r.user})});export const useNavigate=()=>()=>{};export const Link='a';`,
  "@/integrations/supabase/client": "export const supabase=globalThis.__cartOffersTest.client;",
  "@/lib/customer-catalog-data":
    "export const loadCustomerCouponOffers=ids=>globalThis.__cartOffersTest.readOffers(ids);",
  "@/components/ui/button": "export const Button='button';",
  "@/components/ui/input": "export const Input='input';",
  sonner: "export const toast={error(){}};",
};
const hooks = registerHooks({
  resolve(name, context, next) {
    if (name === "react" && !context.parentURL?.endsWith("/cliente.carrinho.tsx"))
      return next(name, context);
    if (modules[name])
      return {
        url: "data:text/javascript," + encodeURIComponent(modules[name]),
        shortCircuit: true,
      };
    return next(name, context);
  },
});
runtime.client = {
  from(table) {
    let filter;
    const query = {
      select: () => query,
      eq: (column, value) => {
        filter = value;
        return query;
      },
      or: () => query,
      order: () => query,
      maybeSingle: () => query,
      then(resolve, reject) {
        runtime.reads.push(table);
        const data =
          table === "cart_items"
            ? (runtime.carts[filter] ?? [])
            : table === "establishments"
              ? {
                  id: filter,
                  nome: `Loja ${filter}`,
                  taxa_entrega_cents: 0,
                  pedido_minimo_cents: 0,
                }
              : [offer("foreign", "GLOBAL")];
        return Promise.resolve({
          data,
          error: table === "cart_items" && runtime.cartFailure ? Error("unavailable") : null,
        }).then(resolve, reject);
      },
    };
    return query;
  },
  channel() {
    return {
      on() {
        return this;
      },
      subscribe() {
        return this;
      },
    };
  },
  removeChannel() {},
};
const { Route } = await import("../src/routes/_authenticated/cliente.carrinho.tsx");
hooks.deregister();
jsx.deregister();
test.after(() => delete globalThis.__cartOffersTest);
const settle = () => new Promise((resolve) => setImmediate(resolve));
function offer(store, code = `CODE-${store}`) {
  return {
    id: `campaign-${store}-${code}`,
    establishment_id: store,
    code,
    type: "percent",
    percent: 10,
    value_cents: 0,
    min_order_cents: 0,
    max_discount_cents: null,
    usage_limit: null,
    used_count: 0,
    ativo: true,
    starts_at: null,
    expires_at: null,
    descricao: null,
  };
}
function item(store) {
  return {
    id: `item-${store}`,
    product_id: `product-${store}`,
    nome_snapshot: `Produto ${store}`,
    preco_unit_cents: 1000,
    quantidade: 1,
    observacoes: null,
    establishment_id: store,
    addons: [],
  };
}
function nodes(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}
function texts(node) {
  if (typeof node === "string") return [node];
  if (!node || typeof node !== "object") return [];
  return [node.props?.children].flat(Infinity).flatMap(texts);
}
async function mount(carts = { A: [item("a")], B: [item("b")] }) {
  Object.assign(runtime, {
    states: [],
    cursor: 0,
    effects: [],
    user: { id: "A" },
    carts,
    reads: [],
    offerReads: [],
    offerFailure: false,
    cartFailure: false,
    defer: null,
  });
  runtime.readOffers = async (ids) => {
    runtime.offerReads.push(ids);
    const result = ids.flatMap((id) => [offer(id), offer(id, null)]);
    if (runtime.defer === ids[0]) {
      runtime.defer = null;
      await new Promise((resolve) => {
        runtime.resolveOffers = resolve;
      });
    }
    if (runtime.offerFailure) throw Error("unavailable");
    return result;
  };
  const previousWindow = globalThis.window,
    previousDocument = globalThis.document;
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const render = (userId = runtime.user.id) => {
    runtime.user = { id: userId };
    runtime.cursor = 0;
    return Route.component();
  };
  const commit = () => runtime.effects.splice(0).forEach((fn) => fn());
  render();
  commit();
  await settle();
  return {
    render,
    commit,
    cleanup() {
      runtime.states.forEach((state) => state?.cleanup?.());
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
    },
  };
}

test("cart offers use only current store participation and never expose an anonymous code", async () => {
  const app = await mount();
  try {
    const tree = app.render();
    assert.ok(texts(tree).includes("CODE-a"));
    assert.ok(!texts(tree).includes("GLOBAL"));
    assert.deepEqual(runtime.offerReads, [["a"]]);
    const couponButtons = nodes(tree).filter(
      (node) => node.type === "button" && node.props.type === "button",
    );
    assert.equal(couponButtons.length, 1);
    couponButtons[0].props.onClick();
    assert.equal(
      nodes(app.render()).find((node) => node.type === "a").props.search.cupom,
      "CODE-a",
    );
  } finally {
    app.cleanup();
  }
});

test("an empty cart does not request any coupon offers", async () => {
  const app = await mount({ A: [] });
  try {
    assert.deepEqual(runtime.offerReads, []);
    assert.ok(!runtime.reads.includes("coupons"));
  } finally {
    app.cleanup();
  }
});

test("resume refresh hides old-store offers immediately and fails closed without full cart flicker", async () => {
  const app = await mount();
  try {
    runtime.carts.A = [item("b")];
    runtime.defer = "b";
    globalThis.window.dispatchEvent(new Event("focus"));
    globalThis.window.dispatchEvent(new Event("pageshow"));
    await settle();
    const tree = app.render();
    assert.ok(texts(tree).includes("Produto b"));
    assert.ok(!texts(tree).includes("CODE-a"));
    assert.deepEqual(runtime.offerReads, [["a"], ["b"]]);
    runtime.offerFailure = true;
    runtime.resolveOffers();
    await settle();
    assert.ok(!texts(app.render()).includes("CODE-a"));
    assert.ok(!texts(app.render()).includes("CODE-b"));
  } finally {
    app.cleanup();
  }
});

test("late offers for a previous customer cannot replace the active customer's offers", async () => {
  const app = await mount();
  try {
    runtime.defer = "a";
    globalThis.window.dispatchEvent(new Event("focus"));
    await settle();
    assert.ok(!texts(app.render("B")).includes("CODE-a"));
    app.commit();
    await settle();
    assert.ok(texts(app.render()).includes("CODE-b"));
    runtime.resolveOffers();
    await settle();
    assert.ok(texts(app.render()).includes("CODE-b"));
    assert.ok(!texts(app.render()).includes("CODE-a"));
  } finally {
    app.cleanup();
  }
});

test("a failed new-customer cart read never reveals the previous customer's cart or offer choice", async () => {
  const app = await mount();
  try {
    const coupon = nodes(app.render()).find(
      (node) => node.type === "button" && node.props.type === "button",
    );
    coupon.props.onClick();
    runtime.cartFailure = true;
    app.render("B");
    app.commit();
    await settle();
    const tree = app.render();
    assert.ok(!texts(tree).includes("Produto a"));
    assert.ok(!texts(tree).includes("CODE-a"));
    assert.ok(
      !nodes(tree).some((node) => node.type === "a" && node.props.search?.cupom === "CODE-a"),
    );
  } finally {
    app.cleanup();
  }
});
