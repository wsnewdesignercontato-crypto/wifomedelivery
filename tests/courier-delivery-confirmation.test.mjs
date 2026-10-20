import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";

const runtime = {};
globalThis.__courierConfirmationTest = runtime;
const jsx = loadTsx();
const react = import.meta.resolve("react");
const modules = {
  react: `export * from ${JSON.stringify(react)};const r=globalThis.__courierConfirmationTest;
    export function useState(initial){const i=r.cursor++;if(!(i in r.states))r.states[i]=typeof initial==='function'?initial():initial;return[r.states[i],value=>r.states[i]=typeof value==='function'?value(r.states[i]):value]}
    export function useRef(initial){const i=r.cursor++;return r.states[i]??={current:initial}}
    export function useEffect(fn,deps){const i=r.cursor++;const old=r.states[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){const s={deps};r.states[i]=s;r.effects.push(()=>{old?.cleanup?.();s.cleanup=fn()})}}`,
  "@tanstack/react-router": "export const createFileRoute=()=>options=>options;",
  "@/integrations/supabase/client":
    "export const supabase=globalThis.__courierConfirmationTest.client;",
  "@/hooks/use-courier": `export const useMyCourier=()=>({courier:{user_id:'courier',aprovacao:'aprovado',status:'online'}});export const fmt=n=>String(n);`,
  "@/lib/resume-refresh": "export const bindResumeRefresh=()=>()=>{};",
  "@/lib/device-preferences":
    "export function getCurrentDevicePosition(){};export const watchDeviceLocation=()=>()=>{};",
  "@/components/order-payment-badge": "export const OrderPaymentBadge='aside';",
  "@/components/order-chat": "export const OrderChat='aside';",
  "@/components/sos-button": "export const SOSButton='aside';",
  sonner: `const r=globalThis.__courierConfirmationTest;export const toast={success:message=>r.messages.push(['success',message]),error:message=>r.messages.push(['error',message])};`,
};
for (const [name, exports] of Object.entries({
  button: ["Button"],
  badge: ["Badge"],
  input: ["Input"],
  dialog: [
    "Dialog",
    "DialogContent",
    "DialogHeader",
    "DialogTitle",
    "DialogFooter",
    "DialogDescription",
  ],
  sheet: ["Sheet", "SheetContent", "SheetHeader", "SheetTitle"],
})) {
  modules[`@/components/ui/${name}`] = exports
    .map((key) =>
      key === "Dialog" || key === "Sheet"
        ? `export function ${key}({open,children}){return open?children:null}`
        : `export const ${key}='${key === "Button" ? "button" : key === "Input" ? "input" : "div"}';`,
    )
    .join("");
}
runtime.client = {
  from(table) {
    let single = false;
    let update;
    const query = {
      select: () => query,
      eq: () => query,
      or: () => query,
      in: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle() {
        single = true;
        return query;
      },
      update(value) {
        update = value;
        return query;
      },
      then(resolve, reject) {
        if (update) runtime.updates.push({ table, value: update });
        const data = update
          ? null
          : table === "deliveries"
            ? single
              ? runtime.delivery
              : []
            : table === "orders"
              ? runtime.order
              : table === "establishments"
                ? { id: "store", nome: "Loja", endereco: "Rua 1", cidade: "Cidade" }
                : table === "profiles"
                  ? { nome: "Cliente", telefone: null }
                  : null;
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  },
  rpc(name, args) {
    runtime.calls.push({ name, args });
    return runtime.confirm();
  },
  storage: {
    from() {
      return {
        upload(...args) {
          runtime.uploads.push(args);
          return runtime.upload();
        },
        createSignedUrl: async () => ({
          data: { signedUrl: "https://proof.example/photo" },
          error: null,
        }),
      };
    },
  },
  channel() {
    const channel = { on: () => channel, subscribe: () => channel };
    return channel;
  },
  removeChannel() {},
};
const hooks = registerHooks({
  resolve(name, context, next) {
    if (name === "react" && !context.parentURL?.endsWith("/entregador.corridas.tsx"))
      return next(name, context);
    if (modules[name])
      return {
        url: "data:text/javascript," + encodeURIComponent(modules[name]),
        shortCircuit: true,
      };
    return next(name, context);
  },
});
const { Route } = await import("../src/routes/_authenticated/entregador.corridas.tsx");
hooks.deregister();
jsx.deregister();

function nodes(node) {
  if (!node || typeof node !== "object") return [];
  if (typeof node.type === "function" && ["Dialog", "Sheet"].includes(node.type.name))
    return nodes(node.type(node.props));
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}
function text(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node && typeof node === "object"
    ? [node.props?.children].flat(Infinity).map(text).join(" ")
    : "";
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
async function mount(status = "at_customer") {
  Object.assign(runtime, {
    states: [],
    cursor: 0,
    effects: [],
    calls: [],
    messages: [],
    updates: [],
    uploads: [],
    delivery: {
      id: "delivery",
      order_id: "order",
      status,
      entregador_id: "courier",
      valor_entrega_cents: 500,
    },
    order: {
      id: "order",
      establishment_id: "store",
      cliente_id: "customer",
      total_cents: 1000,
      forma_pagamento: "pix",
      endereco_entrega: { endereco: "Rua 2" },
      observacoes: null,
      troco_para_cents: null,
    },
    confirm: async () => {
      runtime.delivery = null;
      return { data: { success: true }, error: null };
    },
    upload: async () => ({ data: { path: "proof" }, error: null }),
  });
  const render = () => {
    runtime.cursor = 0;
    return Route.component();
  };
  render();
  runtime.effects.splice(0).forEach((fn) => fn());
  await settle();
  return {
    render,
    controls: () => nodes(render()),
    button(label) {
      return this.controls().find((n) => n.type === "button" && text(n).includes(label));
    },
    confirmations() {
      return this.controls().filter(
        (n) => n.type === "button" && /(Confirmar|Finalizar) entrega/.test(text(n)),
      );
    },
    code(value) {
      this.controls()
        .find((n) => n.type === "input" && n.props.maxLength === 4)
        .props.onChange({ target: { value } });
    },
    cleanup() {
      runtime.states.forEach((s) => s?.cleanup?.());
    },
  };
}

test("customer arrival offers exactly one code entry and delivery confirmation action", async () => {
  const app = await mount();
  try {
    assert.equal(app.confirmations().length, 1);
    app.code("1234");
    assert.equal(app.confirmations().length, 1);
    assert.equal(
      app.controls().filter((n) => n.type === "input" && n.props.maxLength === 4).length,
      1,
    );
    await app.confirmations()[0].props.onClick();
    assert.deepEqual(runtime.calls, [
      {
        name: "confirm_delivery_code",
        args: { p_order_id: "order", p_code: "1234", p_prova_url: undefined },
      },
    ]);
    assert.equal(runtime.uploads.length, 0, "a delivery photo remains optional");
    assert.equal(app.confirmations().length, 0);
    assert.ok(runtime.messages.some(([kind]) => kind === "success"));
    assert.deepEqual(runtime.updates, [{ table: "courier_profiles", value: { status: "online" } }]);
  } finally {
    app.cleanup();
  }
});

test("confirmation requires four digits and invalid server codes remain retryable", async () => {
  const app = await mount();
  try {
    app.code("12ab");
    const invalid = app.button("Finalizar entrega");
    assert.equal(invalid.props.disabled, true);
    await invalid.props.onClick();
    assert.equal(runtime.calls.length, 0);
    app.code("1234");
    runtime.confirm = async () => ({
      data: { success: false, error: "invalid_code" },
      error: null,
    });
    await app.button("Finalizar entrega").props.onClick();
    assert.equal(app.button("Finalizar entrega").props.disabled, false);
    assert.equal(runtime.updates.length, 0);
    assert.ok(
      runtime.messages.some(([kind, msg]) => kind === "error" && msg === "Código incorreto"),
    );
    app.code("5678");
    runtime.confirm = async () => {
      runtime.delivery = null;
      return { data: { success: true }, error: null };
    };
    await app.button("Finalizar entrega").props.onClick();
    assert.equal(runtime.calls.length, 2);
    assert.equal(runtime.calls[1].args.p_code, "5678");
    assert.equal(app.confirmations().length, 0);
  } finally {
    app.cleanup();
  }
});

test("rapid repeated confirmation submits only once while the RPC is pending", async () => {
  const app = await mount();
  try {
    app.code("1234");
    let resolve;
    const response = new Promise((done) => {
      resolve = done;
    });
    runtime.confirm = () => response;
    const button = app.button("Finalizar entrega");
    const pending = button.props.onClick();
    const repeated = button.props.onClick();
    const requestCount = runtime.calls.length;
    assert.equal(app.button("Finalizar entrega").props.disabled, true);
    runtime.delivery = null;
    resolve({ data: { success: true }, error: null });
    // In the regression, both calls await the same response so neither leaks a pending task.
    await Promise.all([pending, repeated]);
    assert.equal(requestCount, 1);
    assert.equal(app.confirmations().length, 0);
  } finally {
    app.cleanup();
  }
});

test("a thrown confirmation transport error releases the action for retry", async () => {
  const app = await mount();
  try {
    app.code("1234");
    runtime.confirm = async () => {
      throw Error("offline");
    };
    await app.button("Finalizar entrega").props.onClick();
    assert.equal(app.button("Finalizar entrega").props.disabled, false);
    assert.equal(runtime.updates.length, 0);
    assert.ok(runtime.messages.some(([kind]) => kind === "error"));
    runtime.confirm = async () => ({
      data: { success: false, error: "invalid_code" },
      error: null,
    });
    await app.button("Finalizar entrega").props.onClick();
    assert.equal(runtime.calls.length, 2);
  } finally {
    app.cleanup();
  }
});

test("optional proof upload shares the confirmation lock and sends the proof to the RPC", async () => {
  const app = await mount();
  try {
    const photo = new File(["photo"], "proof.jpg", { type: "image/jpeg" });
    app
      .controls()
      .find((n) => n.type === "input" && n.props.type === "file")
      .props.onChange({ target: { files: [photo] } });
    app.code("1234");
    let resolve;
    const response = new Promise((done) => {
      resolve = done;
    });
    runtime.upload = () => response;
    const button = app.button("Finalizar entrega");
    const pending = button.props.onClick();
    const repeated = button.props.onClick();
    assert.equal(runtime.uploads.length, 1);
    assert.equal(runtime.calls.length, 0);
    assert.equal(app.button("Finalizar entrega").props.disabled, true);
    resolve({ data: { path: "proof" }, error: null });
    await Promise.all([pending, repeated]);
    assert.equal(runtime.calls.length, 1);
    assert.equal(runtime.calls[0].args.p_prova_url, "https://proof.example/photo");
    assert.equal(app.confirmations().length, 0);
  } finally {
    app.cleanup();
  }
});

test("failed proof upload never confirms delivery and allows the courier to retry", async () => {
  const app = await mount();
  try {
    const photo = new File(["photo"], "proof.jpg", { type: "image/jpeg" });
    app
      .controls()
      .find((n) => n.type === "input" && n.props.type === "file")
      .props.onChange({ target: { files: [photo] } });
    app.code("1234");
    runtime.upload = async () => {
      throw Error("storage offline");
    };
    await app.button("Finalizar entrega").props.onClick();
    assert.equal(runtime.calls.length, 0);
    assert.equal(app.button("Finalizar entrega").props.disabled, false);
    runtime.upload = async () => ({ data: { path: "proof" }, error: null });
    await app.button("Finalizar entrega").props.onClick();
    assert.equal(runtime.calls.length, 1);
    assert.equal(app.confirmations().length, 0);
  } finally {
    app.cleanup();
  }
});

test("earlier delivery stages retain their single progress action", async () => {
  const app = await mount("to_customer");
  try {
    assert.ok(app.button("Cheguei no cliente"));
    assert.equal(app.confirmations().length, 0);
    assert.equal(
      app.controls().filter((n) => n.type === "input" && n.props.maxLength === 4).length,
      0,
    );
  } finally {
    app.cleanup();
  }
});
