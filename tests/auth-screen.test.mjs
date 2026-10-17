import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";
import { APP_PROFILES } from "../src/lib/app-profiles.ts";

const runtime = { states: [], cursor: 0, effects: [], notices: [], calls: [] };
globalThis.__authScreenTest = runtime;
const jsx = loadTsx();
const actualReact = import.meta.resolve("react");
const modules = {
  react: `export * from ${JSON.stringify(actualReact)};
    const r=globalThis.__authScreenTest;
    export function useState(v){const i=r.cursor++;if(!(i in r.states))r.states[i]=v;return[r.states[i],v=>r.states[i]=typeof v==='function'?v(r.states[i]):v]}
    export function useRef(v){const i=r.cursor++;return r.states[i]??={current:v}}
    export function useEffect(fn){const i=r.cursor++;if(!(i in r.states)){r.states[i]=true;r.effects.push(fn)}}
    export const useCallback=fn=>fn;`,
  "@tanstack/react-router":
    "export const Link='a';export const useNavigate=()=>()=>{};export const useLocation=()=>({pathname:'/cliente/entrar',searchStr:''});",
  "@/components/theme-toggle": "export const ThemeToggle='button';",
  "@/integrations/supabase/client":
    "export const supabase={auth:globalThis.__authScreenTest.auth};",
  sonner:
    "const r=globalThis.__authScreenTest;export const toast=Object.fromEntries(['success','error','info'].map(kind=>[kind,message=>r.notices.push({kind,message})]));",
};
runtime.auth = {
  getSession: async () => ({ data: { session: null } }),
  signInWithPassword: async (input) => {
    runtime.calls.push(["login", input]);
    return { error: { code: "email_not_confirmed", message: "Email not confirmed" } };
  },
  signUp: async (input) => {
    runtime.calls.push(["signup", input]);
    return { data: { session: null }, error: null };
  },
  resend: async (input) => {
    runtime.calls.push(["resend", input]);
    return { data: {}, error: null };
  },
};
const hooks = registerHooks({
  resolve(name, context, next) {
    if (name === "react" && !context.parentURL?.endsWith("/auth-screen.tsx"))
      return next(name, context);
    if (modules[name])
      return {
        url: "data:text/javascript," + encodeURIComponent(modules[name]),
        shortCircuit: true,
      };
    return next(name, context);
  },
});
const { AuthScreen } = await import("../src/components/auth-screen.tsx");
hooks.deregister();
jsx.deregister();

function find(node, predicate) {
  if (!node || typeof node !== "object") return;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = find(child, predicate);
    if (found) return found;
  }
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
async function mount(profile) {
  Object.assign(runtime, { states: [], cursor: 0, effects: [], notices: [], calls: [] });
  const previousWindow = globalThis.window,
    previousFormData = globalThis.FormData;
  globalThis.window = {
    location: { origin: APP_PROFILES[profile].origin, hash: "" },
    localStorage: { getItem: () => null, setItem: () => {} },
    setInterval,
    clearInterval,
  };
  globalThis.FormData = class {
    constructor(values) {
      this.values = values;
    }
    get(key) {
      return this.values[key];
    }
  };
  const render = () => {
    runtime.cursor = 0;
    return AuthScreen({ profile, search: {} });
  };
  render();
  runtime.effects.splice(0).forEach((fn) => fn());
  await settle();
  return {
    render,
    cleanup() {
      globalThis.window = previousWindow;
      globalThis.FormData = previousFormData;
    },
  };
}
test("the real signup handler refuses gmail.coml before contacting Auth", async () => {
  const app = await mount("entregador");
  try {
    const form = find(
      app.render(),
      (node) => node.type === "form" && !!find(node, (n) => n.props?.id === "email-cad"),
    );
    await form.props.onSubmit({
      preventDefault() {},
      currentTarget: { nome: "Teste", email: "person@gmail.coml", senha: "SenhaForte123!" },
    });
    assert.equal(runtime.calls.length, 0);
    assert.ok(runtime.notices.some((n) => n.kind === "error" && n.message.includes("gmail.com")));
  } finally {
    app.cleanup();
  }
});
test("an unconfirmed login offers a working, role-specific resend without retrying automatically", async () => {
  for (const profile of Object.keys(APP_PROFILES)) {
    const app = await mount(profile);
    try {
      const form = find(
        app.render(),
        (node) => node.type === "form" && !!find(node, (n) => n.props?.id === "email"),
      );
      await form.props.onSubmit({
        preventDefault() {},
        currentTarget: { email: "person@gmail.com", senha: "SenhaForte123!" },
      });
      const resend = find(app.render(), (node) => node.props?.children === "Reenviar confirmação");
      assert.ok(resend, "Unconfirmed accounts must not be trapped in a login error");
      assert.equal(runtime.calls.length, 1);
      resend.props.onClick();
      resend.props.onClick();
      await settle();
      assert.equal(
        runtime.calls.filter(([kind]) => kind === "resend").length,
        1,
        "Repeated clicks must not send twice",
      );
      const input = runtime.calls.find(([kind]) => kind === "resend")[1];
      assert.equal(new URL(input.options.emailRedirectTo).origin, APP_PROFILES[profile].origin);
      assert.equal(input.type, "signup");
      const nextResend = find(
        app.render(),
        (node) => node.props?.children === "Reenviar confirmação",
      );
      assert.ok(nextResend, "A completed manual request must not impose a 60-second frontend wait");
      assert.equal(nextResend.props.disabled, false);
      nextResend.props.onClick();
      await settle();
      assert.equal(runtime.calls.filter(([kind]) => kind === "resend").length, 2);
    } finally {
      app.cleanup();
    }
  }
});

test("each fresh signup can request confirmation again without a frontend countdown", async () => {
  for (const profile of Object.keys(APP_PROFILES)) {
    const app = await mount(profile);
    try {
      const form = find(
        app.render(),
        (node) => node.type === "form" && !!find(node, (n) => n.props?.id === "email-cad"),
      );
      await form.props.onSubmit({
        preventDefault() {},
        currentTarget: { nome: "Teste", email: "person@gmail.com", senha: "SenhaForte123!" },
      });
      const resend = find(app.render(), (node) => node.props?.children === "Reenviar confirmação");
      assert.ok(resend);
      assert.equal(resend.props.disabled, false);
      assert.equal(
        runtime.calls.filter(([kind]) => kind === "resend").length,
        0,
        "Resend is always manual",
      );
      resend.props.onClick();
      await settle();
      assert.equal(runtime.calls.filter(([kind]) => kind === "resend").length, 1);
    } finally {
      app.cleanup();
    }
  }
});
