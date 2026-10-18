import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";
import { notifyDataUpdated } from "../src/lib/app-refresh.ts";

const runtime = { states: [], cursor: 0, effects: [], address: null };
globalThis.__customerShellRefreshTest = runtime;
const jsx = loadTsx();
const react = import.meta.resolve("react");
const modules = {
  react: `export * from ${JSON.stringify(react)};
    const r=globalThis.__customerShellRefreshTest;
    export function useState(initial){const i=r.cursor++;if(!(i in r.states))r.states[i]=initial;return[r.states[i],value=>r.states[i]=typeof value==='function'?value(r.states[i]):value]}
    export function useEffect(fn,deps){const i=r.cursor++;const old=r.states[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){const state={deps};r.states[i]=state;r.effects.push(()=>{old?.cleanup?.();state.cleanup=fn()})}}`,
  "@tanstack/react-router":
    "export const Link='a';export const Outlet='main';export const useLocation=()=>({pathname:'/cliente/perfil/enderecos'});export const useNavigate=()=>()=>{};",
  "@/integrations/supabase/client":
    "export const supabase=globalThis.__customerShellRefreshTest.client;",
  "@/components/cliente/notifications-bell": "export const NotificationsBell='aside';",
  "@/components/promo-announcement": "export const PromoAnnouncement='aside';",
  "@/components/ifome-logo": "export const IFomeLogo='img';",
};
runtime.client = {
  from(table) {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => query,
      then(resolve, reject) {
        const result = {
          data: table === "addresses" && runtime.address ? [runtime.address] : [],
          error: runtime.readError ? { message: "Unavailable" } : null,
        };
        if (table === "addresses" && runtime.deferNextAddressRead) {
          runtime.deferNextAddressRead = false;
          return new Promise((done) => {
            runtime.resolveAddressRead = () => done(result);
          }).then(resolve, reject);
        }
        return Promise.resolve(result).then(resolve, reject);
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
const hooks = registerHooks({
  resolve(name, context, next) {
    if (name === "react" && !context.parentURL?.endsWith("/cliente-shell.tsx"))
      return next(name, context);
    if (modules[name])
      return {
        url: "data:text/javascript," + encodeURIComponent(modules[name]),
        shortCircuit: true,
      };
    return next(name, context);
  },
});
const { ClienteShell } = await import("../src/components/cliente/cliente-shell.tsx");
hooks.deregister();
jsx.deregister();
function texts(node) {
  if (typeof node === "string") return [node];
  if (!node || typeof node !== "object") return [];
  return [node.props?.children].flat(Infinity).flatMap(texts);
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
async function mount(address = null) {
  Object.assign(runtime, {
    states: [],
    cursor: 0,
    effects: [],
    address,
    readError: false,
    deferNextAddressRead: false,
    resolveAddressRead: null,
  });
  const previousWindow = globalThis.window,
    previousDocument = globalThis.document;
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const render = (userId = "customer-test") => {
    runtime.cursor = 0;
    return ClienteShell({ user: { id: userId } });
  };
  const commitEffects = () => runtime.effects.splice(0).forEach((fn) => fn());
  render();
  commitEffects();
  await settle();
  return {
    render,
    commitEffects,
    cleanup() {
      runtime.states.forEach((state) => state?.cleanup?.());
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
    },
  };
}
test("the customer header shows an address saved in the open app without requiring a reload", async () => {
  const app = await mount();
  try {
    assert.ok(texts(app.render()).includes("Escolher endereço"));
    runtime.address = { rua: "Rua salva", numero: "10" };
    notifyDataUpdated();
    await settle();
    assert.ok(texts(app.render()).includes("Rua salva, 10"));
    assert.ok(!texts(app.render()).includes("Escolher endereço"));
  } finally {
    app.cleanup();
  }
});

test("a different customer never sees the previous customer's address while its read fails", async () => {
  const app = await mount({ rua: "Endereco de A", numero: "1" });
  try {
    assert.ok(texts(app.render()).includes("Endereco de A, 1"));
    runtime.readError = true;
    assert.ok(!texts(app.render("customer-B")).includes("Endereco de A, 1"));
    app.commitEffects();
    await settle();
    assert.ok(!texts(app.render("customer-B")).includes("Endereco de A, 1"));
  } finally {
    app.cleanup();
  }
});

test("a late read from the previous customer cannot overwrite the next customer's address", async () => {
  const app = await mount({ rua: "Endereco de A", numero: "1" });
  try {
    runtime.deferNextAddressRead = true;
    globalThis.window.dispatchEvent(new Event("focus"));
    await settle();
    assert.equal(typeof runtime.resolveAddressRead, "function");
    runtime.address = { rua: "Endereco de B", numero: "2" };
    app.render("customer-B");
    app.commitEffects();
    await settle();
    assert.ok(texts(app.render("customer-B")).includes("Endereco de B, 2"));
    runtime.resolveAddressRead();
    await settle();
    assert.ok(texts(app.render("customer-B")).includes("Endereco de B, 2"));
    assert.ok(!texts(app.render("customer-B")).includes("Endereco de A, 1"));
  } finally {
    app.cleanup();
  }
});
test("the customer header stops showing an address after its last saved address is removed", async () => {
  const app = await mount({ rua: "Rua antiga", numero: "1" });
  try {
    assert.ok(texts(app.render()).includes("Rua antiga, 1"));
    runtime.address = null;
    notifyDataUpdated();
    await settle();
    assert.ok(texts(app.render()).includes("Escolher endereço"));
    assert.ok(!texts(app.render()).includes("Rua antiga, 1"));
  } finally {
    app.cleanup();
  }
});
