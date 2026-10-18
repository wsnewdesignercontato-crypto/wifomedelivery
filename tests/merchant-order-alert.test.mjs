import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";
const r = {
  effects: [],
  rows: [],
  rings: [],
  timers: new Map(),
  channels: [],
  states: [],
  cursor: 0,
};
globalThis.__merchantAlertTest = r;
const jsx = loadTsx(),
  react = import.meta.resolve("react");
const modules = {
  react: `export * from ${JSON.stringify(react)};
 const r=globalThis.__merchantAlertTest;
 export function useState(initial){const i=r.cursor++;if(!(i in r.states))r.states[i]=typeof initial==='function'?initial():initial;return[r.states[i],v=>r.states[i]=typeof v==='function'?v(r.states[i]):v]}
 export function useRef(initial){const i=r.cursor++;return r.states[i]??={current:initial}}
 export function useEffect(fn){r.effects.push(fn)}`,
  "@/integrations/supabase/client": "export const supabase=globalThis.__merchantAlertTest.client;",
  "@/lib/ride-ringtone":
    "const r=globalThis.__merchantAlertTest;export function ensureRingtoneUnlocked(){};export function startRideRingtone(){r.rings.push('start')};export function stopRideRingtone(){r.rings.push('stop')};",
  "@/lib/resume-refresh":
    "export function bindResumeRefresh(fn){globalThis.__merchantAlertTest.resume=fn;return ()=>{}};",
  sonner: "export const toast={success(){}};",
};
const h = registerHooks({
  resolve(specifier, context, next) {
    if (specifier in modules)
      return { url: "merchant-test:" + encodeURIComponent(specifier), shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith("merchant-test:"))
      return {
        format: "module",
        source: modules[decodeURIComponent(url.slice(14))],
        shortCircuit: true,
      };
    return next(url, context);
  },
});
r.client = {
  from() {
    const q = {
      select: () => q,
      eq: () => q,
      order: () => q,
      limit: () => q,
      then(resolve) {
        return Promise.resolve(resolve({ data: structuredClone(r.rows), error: null }));
      },
    };
    return q;
  },
  channel() {
    const ch = {
      on(event, filter, callback) {
        r.changed = callback;
        return ch;
      },
      subscribe() {
        return ch;
      },
    };
    r.channels.push(ch);
    return ch;
  },
  removeChannel() {
    r.removed = true;
  },
};
const { useNewOrderAlert } = await import("../src/hooks/use-new-order-alert.ts");
test.after(() => {
  h.deregister();
  jsx.deregister();
  delete globalThis.__merchantAlertTest;
});
test("merchant loop reconciles acceptance, resumes missed orders, stops at expiry and cleans up", async () => {
  const originalSet = globalThis.setInterval,
    originalClear = globalThis.clearInterval;
  globalThis.setInterval = (fn, ms) => {
    r.timers.set(ms, fn);
    return ms;
  };
  globalThis.clearInterval = (id) => r.timers.delete(id);
  try {
    r.rows = [
      {
        id: "one",
        status: "placed",
        acceptance_deadline: new Date(Date.now() + 60000).toISOString(),
      },
    ];
    useNewOrderAlert("shop");
    const cleanups = r.effects.map((fn) => fn());
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(r.rings.at(-1), "start");
    r.rows = [];
    r.changed();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(r.rings.at(-1), "stop");
    r.rows = [
      {
        id: "missed",
        status: "placed",
        acceptance_deadline: new Date(Date.now() + 60000).toISOString(),
      },
    ];
    await r.resume();
    assert.equal(r.rings.at(-1), "start");
    r.states[1].current[0].acceptance_deadline = new Date(Date.now() - 1).toISOString();
    r.timers.get(1000)();
    assert.equal(r.rings.at(-1), "stop");
    cleanups.forEach((fn) => fn?.());
    assert.equal(r.removed, true);
    assert.equal(r.timers.size, 0);
  } finally {
    globalThis.setInterval = originalSet;
    globalThis.clearInterval = originalClear;
  }
});
