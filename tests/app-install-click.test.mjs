import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { loadTsx } from "./helpers/load-tsx.mjs";
import { APP_PROFILES } from "../src/lib/app-profiles.ts";

// Real component handlers and native-offer capture; no physical OS installation is simulated.
const runtime = { states: [], cursor: 0, effects: [], timers: [] };
globalThis.__installClickTest = runtime;
const app = APP_PROFILES.entregador;
const w = Object.assign(new EventTarget(), {
  location: {
    origin: app.origin,
    pathname: app.loginPath,
    search: "",
    assign() {
      assert.fail("Correct scoped login must not redirect");
    },
  },
  matchMedia: () => Object.assign(new EventTarget(), { matches: false }),
  setTimeout: (fn, ms) => {
    runtime.timers.push({ fn, ms });
    return runtime.timers.length;
  },
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
  localStorage: { getItem: () => null, setItem() {} },
  sessionStorage: { getItem: () => null, setItem() {} },
});
globalThis.window = w;
globalThis.document = Object.assign(new EventTarget(), {
  visibilityState: "visible",
  querySelector: (selector) =>
    selector.includes('rel="manifest"') ? { getAttribute: () => app.manifest } : null,
});
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    userAgent: "Mozilla/5.0 (Linux; Android 15) Chrome/155.0 Mobile Safari/537.36",
    platform: "Linux",
    maxTouchPoints: 1,
  },
});
w.onbeforeinstallprompt = null;
const jsx = loadTsx();
const actualReact = import.meta.resolve("react");
const modules = {
  react: `export * from ${JSON.stringify(actualReact)};const r=globalThis.__installClickTest;
    export function useState(v){const i=r.cursor++;if(!(i in r.states))r.states[i]=typeof v==='function'?v():v;return[r.states[i],v=>r.states[i]=typeof v==='function'?v(r.states[i]):v]}
    export function useRef(v){const i=r.cursor++;return r.states[i]??={current:v}}
    export function useEffect(fn){const i=r.cursor++;if(!(i in r.states)){r.states[i]=true;r.effects.push(fn)}}
    export const useCallback=fn=>fn;`,
  "@/components/pwa-install-sync": "export const PwaInstallSync=()=>null;",
};
const hooks = registerHooks({
  resolve(name, context, next) {
    if (
      name === "react" &&
      !/\/(app-download-links|use-app-instalado)\.tsx?$/.test(context.parentURL ?? "")
    )
      return next(name, context);
    if (modules[name])
      return {
        url: "data:text/javascript," + encodeURIComponent(modules[name]),
        shortCircuit: true,
      };
    if (name.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const base = new URL(name, context.parentURL);
      for (const ext of [".ts", ".tsx"])
        if (existsSync(new URL(base.href + ext)))
          return { url: base.href + ext, shortCircuit: true };
    }
    return next(name, context);
  },
});
const { AppDownloadLinks } = await import("../src/components/app-download-links.tsx");
hooks.deregister();
jsx.deregister();
function find(node, predicate) {
  if (!node || typeof node !== "object") return;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = find(child, predicate);
    if (result) return result;
  }
}
const render = () => {
  runtime.cursor = 0;
  return AppDownloadLinks({ perfilAtual: "entregador" });
};
const settle = () => new Promise((resolve) => setImmediate(resolve));
async function mount() {
  Object.assign(runtime, { states: [], cursor: 0, effects: [], timers: [] });
  render();
  const cleanups = runtime.effects.splice(0).map((fn) => fn());
  await settle();
  return () => {
    for (const cleanup of cleanups) if (typeof cleanup === "function") cleanup();
  };
}
test("an Android courier without a native offer gets an immediate visible installation path", async () => {
  const cleanup = await mount();
  try {
    find(render(), (node) => typeof node.props?.onInstall === "function").props.onInstall();
    await settle();
    assert.ok(
      find(render(), (node) => node.props?.open === true),
      "A click must open useful guidance instead of waiting 45 seconds",
    );
    assert.ok(
      !runtime.timers.some((timer) => timer.ms === 45000),
      "No pretend installation preparation timeout",
    );
  } finally {
    cleanup();
  }
});
test("a late courier offer is used only on a new click and never counted as installed by acceptance alone", async () => {
  const cleanup = await mount();
  let prompts = 0;
  try {
    find(render(), (node) => typeof node.props?.onInstall === "function").props.onInstall();
    await settle();
    w.dispatchEvent(
      Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
        prompt: async () => {
          prompts++;
        },
        userChoice: Promise.resolve({ outcome: "accepted" }),
      }),
    );
    assert.equal(prompts, 0, "The event is not a user gesture");
    const button = find(render(), (node) => typeof node.props?.onInstall === "function");
    assert.equal(button.props.nativeReady, true);
    button.props.onInstall();
    button.props.onInstall();
    await settle();
    assert.equal(prompts, 1);
    assert.equal(
      find(render(), (node) => typeof node.props?.onInstall === "function").props.instalado,
      false,
    );
  } finally {
    cleanup();
  }
});
