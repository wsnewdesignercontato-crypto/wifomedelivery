import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";

const runtime = { states: [], cursor: 0, effects: [] };
globalThis.__asaasSettingsTest = runtime;
const jsx = loadTsx();
const react = import.meta.resolve("react");
const modules = {
  "./asaas-online-controls": `export const AsaasOnlineControls='aside';`,
  react: `export * from ${JSON.stringify(react)};const r=globalThis.__asaasSettingsTest;
    export function useState(initial){const i=r.cursor++;if(!(i in r.states))r.states[i]=typeof initial==='function'?initial():initial;return[r.states[i],value=>r.states[i]=typeof value==='function'?value(r.states[i]):value]}
    export function useRef(initial){const i=r.cursor++;return r.states[i]??={current:initial}}
    export function useEffect(fn,deps){const i=r.cursor++;const old=r.states[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){const s={deps};r.states[i]=s;r.effects.push(()=>{old?.cleanup?.();s.cleanup=fn()})}}`,
  "@tanstack/react-start": "export const useServerFn=fn=>fn;",
  "@tanstack/react-query": `const r=globalThis.__asaasSettingsTest;export function useQuery(options){r.query=options;return{data:r.statuses[options.queryKey.at(-1)],isPending:false,error:null,refetch:()=>options.queryFn()}};export const useQueryClient=()=>({setQueryData(key,value){r.statuses[key.at(-1)]=value}});`,
  "@/lib/admin-asaas.functions": `const r=globalThis.__asaasSettingsTest;export const getAsaasSettings=input=>r.server('get',input);export const saveAsaasSettings=input=>r.server('save',input);export const testAsaasConnection=input=>r.server('test',input);export const registerAsaasWebhook=input=>r.server('register',input);`,
  "@/components/ui/button": "export const Button='button';",
  "@/components/ui/input": "export const Input='input';",
  "@/components/ui/label": "export const Label='label';",
  sonner:
    "const r=globalThis.__asaasSettingsTest;export const toast={success:message=>r.messages.push(['success',message]),error:message=>r.messages.push(['error',message])};",
};
const hooks = registerHooks({
  resolve(name, context, next) {
    if (name === "react" && !context.parentURL?.endsWith("/asaas-settings.tsx"))
      return next(name, context);
    if (modules[name])
      return {
        url: "data:text/javascript," + encodeURIComponent(modules[name]),
        shortCircuit: true,
      };
    return next(name, context);
  },
});
const { AsaasSettings } = await import("../src/components/admin/asaas-settings.tsx").catch(
  (error) => {
    if (error.code === "ERR_MODULE_NOT_FOUND") return {};
    throw error;
  },
);
hooks.deregister();
jsx.deregister();
const status = (environment, changes = {}) => ({
  environment,
  notificationEmail: `${environment}@example.com`,
  configured: true,
  tested: true,
  testedAt: "2026-10-18T12:00:00Z",
  webhookConfigured: false,
  webhookId: null,
  lastWebhookAt: null,
  revision: "1",
  webhookUrl: `https://app.example.com/api/payments/asaas/${environment}`,
  ...changes,
});
function nodes(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}
function texts(node) {
  if (typeof node === "string") return [node];
  if (!node || typeof node !== "object") return [];
  return [node.props?.children].flat(Infinity).flatMap(texts);
}
function mount(changes = {}) {
  assert.equal(typeof AsaasSettings, "function", "Asaas settings UI must exist");
  Object.assign(runtime, {
    states: [],
    cursor: 0,
    effects: [],
    statuses: { sandbox: status("sandbox"), production: status("production", { tested: false }) },
    calls: [],
    messages: [],
    deny: false,
    defer: null,
    ...changes,
  });
  runtime.server = async (action, input) => {
    runtime.calls.push({ action, input });
    if (runtime.deny) throw Error("Admin required: private-key-must-never-render");
    const environment = input.data.environment;
    let next = { ...runtime.statuses[environment] };
    if (action === "save")
      next = {
        ...next,
        notificationEmail: input.data.notificationEmail,
        configured: true,
        tested: false,
        revision: String(Number(next.revision) + 1),
      };
    if (action === "test") next = { ...next, tested: true };
    if (action === "register") next = { ...next, webhookConfigured: true, webhookId: "hook-id" };
    const value =
      action === "get" || action === "save"
        ? next
        : { status: next, message: `${action} completed` };
    if (runtime.defer === action) {
      runtime.defer = null;
      return new Promise((resolve) => {
        runtime.resolve = () => resolve(value);
      });
    }
    return value;
  };
  const render = () => {
    runtime.cursor = 0;
    return AsaasSettings();
  };
  const flush = () => {
    render();
    runtime.effects.splice(0).forEach((fn) => fn());
    return render();
  };
  flush();
  return {
    render,
    flush,
    input(id) {
      return nodes(render()).find((n) => n.props?.id === id);
    },
    button(label) {
      return nodes(render()).find((n) => n.type === "button" && texts(n).includes(label));
    },
    change(id, value) {
      this.input(id).props.onChange({ target: { value } });
      return flush();
    },
    save() {
      return nodes(render())
        .find((n) => n.type === "form")
        .props.onSubmit({ preventDefault() {} });
    },
    cleanup() {
      runtime.states.forEach((s) => s?.cleanup?.());
    },
  };
}

test("Asaas starts in Sandbox and reads only that environment through the server boundary", async () => {
  const app = mount();
  try {
    assert.equal(app.input("asaas-environment").props.value, "sandbox");
    await runtime.query.queryFn();
    assert.deepEqual(runtime.calls, [
      { action: "get", input: { data: { environment: "sandbox" } } },
    ]);
    assert.match(texts(app.render()).join(" "), /Conexão de pagamentos/);
  } finally {
    app.cleanup();
  }
});
test("secrets are password inputs, sent only on save, then removed from the rendered state", async () => {
  const app = mount();
  try {
    for (const id of ["asaas-api-key", "asaas-webhook-token"])
      assert.equal(app.input(id).props.type, "password");
    app.change("asaas-api-key", "private-api-key");
    app.change("asaas-webhook-token", "private-hook-token");
    await app.save();
    app.flush();
    assert.deepEqual(runtime.calls[0], {
      action: "save",
      input: {
        data: {
          environment: "sandbox",
          notificationEmail: "sandbox@example.com",
          apiKey: "private-api-key",
          webhookToken: "private-hook-token",
        },
      },
    });
    assert.equal(app.input("asaas-api-key").props.value, "");
    assert.equal(app.input("asaas-webhook-token").props.value, "");
    assert.ok(!texts(app.render()).join(" ").includes("private-api-key"));
  } finally {
    app.cleanup();
  }
});
test("blank secrets preserve existing credentials while saving the notification address", async () => {
  const app = mount();
  try {
    app.change("asaas-notification-email", "updated@example.com");
    await app.save();
    assert.deepEqual(runtime.calls[0].input, {
      data: { environment: "sandbox", notificationEmail: "updated@example.com" },
    });
  } finally {
    app.cleanup();
  }
});
test("unsaved changes disable and guard both connection testing and webhook registration", async () => {
  const app = mount();
  try {
    app.change("asaas-api-key", "replacement");
    for (const label of ["Testar conexão", "Registrar/atualizar webhook"]) {
      const button = app.button(label);
      assert.equal(button.props.disabled, true);
      await button.props.onClick();
    }
    assert.equal(runtime.calls.length, 0);
  } finally {
    app.cleanup();
  }
});
test("an unconfigured environment cannot be tested or registered and requires a key before saving", async () => {
  const app = mount({
    statuses: {
      sandbox: status("sandbox", { configured: false, tested: false }),
      production: status("production"),
    },
  });
  try {
    for (const label of ["Testar conexão", "Registrar/atualizar webhook"])
      assert.equal(app.button(label).props.disabled, true);
    app.change("asaas-notification-email", "updated@example.com");
    await app.save();
    assert.equal(runtime.calls.length, 0);
    assert.ok(runtime.messages.some((m) => m[0] === "error"));
  } finally {
    app.cleanup();
  }
});
test("webhook registration requires a successful test of the current saved environment", async () => {
  const app = mount();
  try {
    app.change("asaas-environment", "production");
    assert.equal(app.button("Registrar/atualizar webhook").props.disabled, true);
    await app.button("Registrar/atualizar webhook").props.onClick();
    assert.equal(runtime.calls.length, 0);
    await app.button("Testar conexão").props.onClick();
    app.flush();
    assert.equal(app.button("Registrar/atualizar webhook").props.disabled, false);
    await app.button("Registrar/atualizar webhook").props.onClick();
    assert.deepEqual(
      runtime.calls.map((c) => [c.action, c.input]),
      [
        ["test", { data: { environment: "production" } }],
        ["register", { data: { environment: "production" } }],
      ],
    );
  } finally {
    app.cleanup();
  }
});
test("switching environments clears secret drafts and a late save cannot change the new environment", async () => {
  const app = mount();
  try {
    app.change("asaas-api-key", "sandbox-only-key");
    app.change("asaas-webhook-token", "sandbox-only-hook-token");
    runtime.defer = "save";
    const pending = app.save();
    app.change("asaas-environment", "production");
    assert.equal(app.input("asaas-api-key").props.value, "");
    assert.equal(app.input("asaas-webhook-token").props.value, "");
    assert.equal(app.input("asaas-notification-email").props.value, "production@example.com");
    runtime.resolve();
    await pending;
    app.flush();
    assert.equal(app.input("asaas-notification-email").props.value, "production@example.com");
    assert.equal(runtime.messages.length, 0);
    assert.equal(runtime.statuses.production.revision, "1");
    assert.equal(
      app.input("asaas-webhook-url").props.value,
      "https://app.example.com/api/payments/asaas/production",
    );
  } finally {
    app.cleanup();
  }
});
test("a late test result cannot mark another environment as tested", async () => {
  const app = mount();
  try {
    runtime.defer = "test";
    const pending = app.button("Testar conexão").props.onClick();
    app.change("asaas-environment", "production");
    runtime.resolve();
    await pending;
    app.flush();
    assert.equal(app.button("Registrar/atualizar webhook").props.disabled, true);
    assert.equal(runtime.messages.length, 0);
  } finally {
    app.cleanup();
  }
});
test("returning to the original environment still rejects an operation from its previous visit", async () => {
  const app = mount();
  try {
    runtime.defer = "register";
    const pending = app.button("Registrar/atualizar webhook").props.onClick();
    app.change("asaas-environment", "production");
    app.change("asaas-environment", "sandbox");
    runtime.resolve();
    await pending;
    app.flush();
    assert.equal(runtime.statuses.sandbox.webhookConfigured, false);
    assert.equal(runtime.messages.length, 0);
    assert.equal(app.input("asaas-webhook-url").props.readOnly, true);
  } finally {
    app.cleanup();
  }
});
test("authorization errors never report success or reveal server error content", async () => {
  const app = mount();
  try {
    runtime.deny = true;
    await app.button("Testar conexão").props.onClick();
    app.flush();
    assert.equal(runtime.messages.filter((m) => m[0] === "success").length, 0);
    assert.equal(runtime.messages.filter((m) => m[0] === "error").length, 1);
    assert.ok(!JSON.stringify(runtime.messages).includes("private-key-must-never-render"));
  } finally {
    app.cleanup();
  }
});
test("busy controls prevent duplicate API requests and unmounted responses stay silent", async () => {
  const app = mount();
  runtime.defer = "test";
  const button = app.button("Testar conexão");
  const pending = button.props.onClick();
  await button.props.onClick();
  assert.equal(runtime.calls.length, 1);
  app.cleanup();
  runtime.resolve();
  await pending;
  assert.equal(runtime.messages.length, 0);
});
