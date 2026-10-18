import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";
const runtime = {
  states: [],
  cursor: 0,
  effects: [],
  handlers: [],
  rows: [],
  loads: 0,
  cleanups: [],
};
globalThis.__notificationReconciliationTest = runtime;
const jsx = loadTsx();
const modules = {
  react: `export * from ${JSON.stringify(import.meta.resolve("react"))}; const r=globalThis.__notificationReconciliationTest;
 export function useState(v){const i=r.cursor++;if(!(i in r.states))r.states[i]=v;return[r.states[i],v=>r.states[i]=typeof v==='function'?v(r.states[i]):v]}
 export function useEffect(fn){const i=r.cursor++;if(!(i in r.states)){r.states[i]=true;r.effects.push(fn)}}`,
  "@/integrations/supabase/client": `const r=globalThis.__notificationReconciliationTest;
 export const supabase={from(){const q={select(){return q},eq(){return q},or(){return q},order(){return q},limit(){r.loads++;return Promise.resolve({data:r.rows})}};return q},channel(){const ch={on(type,filter,fn){r.handlers.push({filter,fn});return ch},subscribe(fn){r.subscription=fn;return ch}};return ch},removeChannel(){r.removed=true}};`,
  "@/hooks/use-push-notifications": `export const usePushNotifications=()=>({supported:false});export const setAppBadgeCount=()=>{};`,
  "@tanstack/react-router": `export const useNavigate=()=>()=>{};`,
  "@/lib/notification-sound": `export const playBellChime=()=>{};`,
  sonner: `export const toast=Object.assign(()=>{},{success:()=>{}});`,
};
const hooks = registerHooks({
  resolve(name, ctx, next) {
    if (name === "react" && !ctx.parentURL?.endsWith("/notifications-bell.tsx"))
      return next(name, ctx);
    if (modules[name])
      return {
        url: "data:text/javascript," + encodeURIComponent(modules[name]),
        shortCircuit: true,
      };
    return next(name, ctx);
  },
});
const { NotificationsBell } = await import("../src/components/cliente/notifications-bell.tsx");
hooks.deregister();
jsx.deregister();
const settle = () => new Promise((resolve) => setImmediate(resolve));
function find(node, p) {
  if (!node || typeof node !== "object") return;
  if (p(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = find(child, p);
    if (found) return found;
  }
}
async function mount() {
  Object.assign(runtime, {
    states: [],
    cursor: 0,
    effects: [],
    handlers: [],
    rows: [
      {
        id: "pending",
        titulo: "Loja pendente",
        mensagem: "Analisar cadastro",
        audience: "admin",
        lida: false,
        created_at: new Date().toISOString(),
      },
    ],
    loads: 0,
    removed: false,
  });
  const priorWindow = globalThis.window,
    priorDocument = globalThis.document;
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const render = () => {
    runtime.cursor = 0;
    return NotificationsBell({ userId: "admin", audience: "admin" });
  };
  render();
  const cleanups = runtime.effects.splice(0).map((fn) => fn());
  await settle();
  return {
    render,
    cleanup() {
      cleanups.forEach((fn) => fn?.());
      globalThis.window = priorWindow;
      globalThis.document = priorDocument;
    },
  };
}
test("approval by another admin removes the pending notice and counter from an already open bell", async () => {
  const app = await mount();
  try {
    assert.ok(find(app.render(), (n) => n.props?.children === "Loja pendente"));
    const handler = runtime.handlers.find(
      (h) => h.filter.event === "*" || h.filter.event === "UPDATE",
    );
    assert.ok(handler, "the notification feed must reconcile updates, not just inserts");
    runtime.rows = [];
    handler.fn({ eventType: "UPDATE", new: { id: "pending", audience: "admin", lida: true } });
    await settle();
    assert.equal(
      find(app.render(), (n) => n.props?.children === "Loja pendente"),
      undefined,
    );
  } finally {
    app.cleanup();
  }
});
test("notifications reload after resuming or reconnecting, and detach listeners on unmount", async () => {
  const app = await mount();
  try {
    for (const event of ["focus", "online", "pageshow"]) {
      const before = runtime.loads;
      globalThis.window.dispatchEvent(new Event(event));
      await settle();
      assert.ok(runtime.loads > before, event);
    }
    let before = runtime.loads;
    globalThis.document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    assert.ok(runtime.loads > before);
    assert.equal(typeof runtime.subscription, "function");
    before = runtime.loads;
    runtime.subscription("SUBSCRIBED");
    await settle();
    assert.ok(runtime.loads > before);
  } finally {
    const oldWindow = globalThis.window;
    app.cleanup();
    const before = runtime.loads;
    oldWindow.dispatchEvent(new Event("focus"));
    await settle();
    assert.equal(runtime.loads, before);
    assert.equal(runtime.removed, true);
  }
});
