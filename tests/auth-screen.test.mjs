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
    return runtime.signupResult ?? { data: { session: null }, error: null };
  },
  resend: async (input) => {
    runtime.calls.push(["resend", input]);
    return { data: {}, error: null };
  },
  resetPasswordForEmail: async (email, options) => {
    runtime.calls.push(["recovery", { email, ...options }]);
    return { data: {}, error: runtime.recoveryError };
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
const { Dialog, DialogContent } = await import("../src/components/ui/dialog.tsx");
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
  runtime.recoveryError = null;
  runtime.signupResult = null;
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
      runtime.signupResult = {
        data: { session: null, user: { identities: [{ id: "new-user" }] } },
        error: null,
      };
      const form = find(
        app.render(),
        (node) => node.type === "form" && !!find(node, (n) => n.props?.id === "email-cad"),
      );
      await form.props.onSubmit({
        preventDefault() {},
        currentTarget: {
          nome: "Teste",
          email: `${profile}.novo@example.com`,
          senha: "SenhaForte123!",
        },
      });
      assert.ok(!find(app.render(), (node) => node.type === Dialog && node.props.open));
      assert.equal(runtime.calls[0][1].email, `${profile}.novo@example.com`);
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

test("password recovery uses the entered email and the corresponding app origin for every profile", async () => {
  for (const profile of Object.keys(APP_PROFILES)) {
    const app = await mount(profile);
    try {
      find(app.render(), (node) => node.props?.children === "Esqueci minha senha").props.onClick();
      const form = find(
        app.render(),
        (node) => node.type === "form" && !!find(node, (input) => input.props?.id === "email-rec"),
      );
      const email = `${profile}@example.com`;
      await form.props.onSubmit({ preventDefault() {}, currentTarget: { email } });
      assert.deepEqual(runtime.calls, [
        [
          "recovery",
          {
            email,
            redirectTo: APP_PROFILES[profile].origin + "/redefinir-senha?perfil=" + profile,
          },
        ],
      ]);
      assert.ok(find(app.render(), (node) => node.props?.children === "Link enviado!"));
    } finally {
      app.cleanup();
    }
  }
});

test("a refused password recovery remains on the form and never reports a link was sent", async () => {
  for (const profile of Object.keys(APP_PROFILES)) {
    const app = await mount(profile);
    try {
      runtime.recoveryError = { message: "Envio indisponível" };
      find(app.render(), (node) => node.props?.children === "Esqueci minha senha").props.onClick();
      const form = find(
        app.render(),
        (node) => node.type === "form" && !!find(node, (input) => input.props?.id === "email-rec"),
      );
      await form.props.onSubmit({
        preventDefault() {},
        currentTarget: { email: `${profile}@example.com` },
      });
      assert.ok(!find(app.render(), (node) => node.props?.children === "Link enviado!"));
      assert.ok(
        find(
          app.render(),
          (node) =>
            node.type === "form" && !!find(node, (input) => input.props?.id === "email-rec"),
        ),
      );
      assert.ok(
        runtime.notices.some(
          (notice) => notice.kind === "error" && notice.message === "Envio indisponível",
        ),
      );
      assert.equal(runtime.calls.length, 1);
    } finally {
      app.cleanup();
    }
  }
});

for (const response of [
  { data: { session: null, user: { identities: [] } }, error: null },
  {
    data: { session: null, user: null },
    error: { code: "user_already_exists", message: "User already registered" },
  },
]) {
  test(`a repeated signup offers existing-account access instead of waiting for another confirmation (${response.error?.code ?? "obfuscated"})`, async () => {
    for (const profile of ["estabelecimento", "entregador"]) {
      const app = await mount(profile);
      try {
        runtime.signupResult = response;
        const form = find(
          app.render(),
          (node) =>
            node.type === "form" && !!find(node, (input) => input.props?.id === "email-cad"),
        );
        await form.props.onSubmit({
          preventDefault() {},
          currentTarget: { nome: "Teste", email: "person@gmail.com", senha: "SenhaForte123!" },
        });
        assert.ok(
          find(app.render(), (node) => node.type === Dialog && node.props.open),
          "The shared-account notice must open as a popup",
        );
        assert.ok(!find(app.render(), (node) => node.props?.children === "Reenviar confirmação"));
        const enter = find(
          app.render(),
          (node) => node.props?.children === "Entrar com minha conta",
        );
        assert.ok(enter, "A repeated signup must offer access with the existing credentials");
        assert.equal(runtime.calls.length, 1, "Do not send/retry mail or sign in automatically");
        enter.props.onClick();
        const email = find(app.render(), (node) => node.props?.id === "email");
        assert.equal(email.props.defaultValue, "person@gmail.com");
        assert.ok(!runtime.notices.some((notice) => notice.message === "User already registered"));
      } finally {
        app.cleanup();
      }
    }
  });
}

test("existing-account guidance keeps password recovery available for the chosen app", async () => {
  for (const profile of ["estabelecimento", "entregador"]) {
    const app = await mount(profile);
    try {
      runtime.signupResult = { data: { session: null, user: { identities: [] } }, error: null };
      const form = find(
        app.render(),
        (node) => node.type === "form" && !!find(node, (input) => input.props?.id === "email-cad"),
      );
      await form.props.onSubmit({
        preventDefault() {},
        currentTarget: { nome: "Teste", email: "person@gmail.com", senha: "SenhaForte123!" },
      });
      const dialog = find(app.render(), (node) => node.type === Dialog && node.props.open);
      const recovery = find(dialog, (node) => node.props?.children === "Esqueci minha senha");
      assert.ok(recovery);
      recovery.props.onClick();
      assert.equal(
        find(app.render(), (node) => node.props?.id === "email-rec").props.defaultValue,
        "person@gmail.com",
      );
    } finally {
      app.cleanup();
    }
  }
});

test("closing the repeated-signup popup returns to login with the entered email", async () => {
  const app = await mount("estabelecimento");
  try {
    runtime.signupResult = { data: { session: null, user: { identities: [] } }, error: null };
    const form = find(
      app.render(),
      (node) => node.type === "form" && !!find(node, (input) => input.props?.id === "email-cad"),
    );
    await form.props.onSubmit({
      preventDefault() {},
      currentTarget: { nome: "Teste", email: "person@gmail.com", senha: "SenhaForte123!" },
    });
    const dialog = find(app.render(), (node) => node.type === Dialog && node.props.open);
    assert.ok(dialog);
    dialog.props.onOpenChange(false);
    assert.ok(!find(app.render(), (node) => node.type === Dialog && node.props.open));
    assert.equal(
      find(app.render(), (node) => node.props?.id === "email").props.defaultValue,
      "person@gmail.com",
    );
    assert.equal(runtime.calls.length, 1);
  } finally {
    app.cleanup();
  }
});

test("the repeated-signup popup can start a new registration with a different email", async () => {
  const app = await mount("entregador");
  try {
    runtime.signupResult = { data: { session: null, user: { identities: [] } }, error: null };
    const form = find(
      app.render(),
      (node) => node.type === "form" && !!find(node, (input) => input.props?.id === "email-cad"),
    );
    await form.props.onSubmit({
      preventDefault() {},
      currentTarget: { nome: "Teste", email: "person@gmail.com", senha: "SenhaForte123!" },
    });
    const dialog = find(app.render(), (node) => node.type === Dialog && node.props.open);
    find(dialog, (node) => node.props?.children === "Cadastrar com outro e-mail").props.onClick();
    assert.ok(!find(app.render(), (node) => node.type === Dialog && node.props.open));
    assert.equal(
      find(app.render(), (node) => node.props?.id === "email-cad").props.defaultValue,
      "",
    );
    assert.equal(runtime.calls.length, 1);
  } finally {
    app.cleanup();
  }
});

test("a signup email delivery error is not replaced by the existing-account popup", async () => {
  const app = await mount("estabelecimento");
  try {
    runtime.signupResult = {
      data: { session: null, user: null },
      error: { code: "hook_timeout", message: "Envio indisponível" },
    };
    const form = find(
      app.render(),
      (node) => node.type === "form" && !!find(node, (input) => input.props?.id === "email-cad"),
    );
    await form.props.onSubmit({
      preventDefault() {},
      currentTarget: { nome: "Teste", email: "person@gmail.com", senha: "SenhaForte123!" },
    });
    assert.ok(!find(app.render(), (node) => node.type === Dialog && node.props.open));
    assert.ok(
      runtime.notices.some(
        (notice) => notice.kind === "error" && notice.message === "Envio indisponível",
      ),
    );
  } finally {
    app.cleanup();
  }
});

test("closing the account popup focuses the visible login, recovery or registration field", async () => {
  for (const nextField of ["senha", "email-rec", "email-cad"]) {
    const app = await mount("entregador");
    const previousDocument = globalThis.document;
    try {
      runtime.signupResult = { data: { session: null, user: { identities: [] } }, error: null };
      const form = find(
        app.render(),
        (node) => node.type === "form" && !!find(node, (input) => input.props?.id === "email-cad"),
      );
      await form.props.onSubmit({
        preventDefault() {},
        currentTarget: { nome: "Teste", email: "person@gmail.com", senha: "SenhaForte123!" },
      });
      const content = find(app.render(), (node) => node.type === DialogContent);
      assert.equal(typeof content.props.onCloseAutoFocus, "function");
      let focused;
      let prevented = false;
      globalThis.document = {
        getElementById: (id) => ({
          getClientRects: () => (id === nextField ? [{}] : []),
          focus: () => {
            focused = id;
          },
        }),
      };
      content.props.onCloseAutoFocus({
        preventDefault() {
          prevented = true;
        },
      });
      assert.equal(prevented, true);
      assert.equal(focused, nextField);
    } finally {
      globalThis.document = previousDocument;
      app.cleanup();
    }
  }
});
