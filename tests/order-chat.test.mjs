import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";
const r = {};
globalThis.__orderChatTest = r;
const jsx = loadTsx();
const modules = {
  react: `export * from ${JSON.stringify(import.meta.resolve("react"))};const r=globalThis.__orderChatTest;
  export function useState(v){const i=r.cursor++;if(!(i in r.states))r.states[i]=typeof v==='function'?v():v;return[r.states[i],v=>r.states[i]=typeof v==='function'?v(r.states[i]):v]}
  export function useRef(v){const i=r.cursor++;return r.states[i]??={current:v}}
  export function useEffect(fn,deps){const i=r.cursor++;const old=r.states[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){const s={deps};r.states[i]=s;r.effects.push(()=>{old?.cleanup?.();s.cleanup=fn()})}}`,
  "@/integrations/supabase/client": "export const supabase=globalThis.__orderChatTest.client;",
  "@/components/ui/button": "export const Button='button';",
  "@/components/ui/input": "export const Input='input';",
  "@/lib/device-preferences": "export const isLocationEnabled=()=>false;",
  "@/lib/upload-validation": "export const validateImageFile=()=>null;",
  "@/lib/data-access": "export const chatAttachmentPath=x=>x;",
  sonner:
    "const r=globalThis.__orderChatTest;export const toast={error:m=>r.errors.push(m),success(){}};",
};
r.client = {
  auth: { getUser: async () => ({ data: { user: { id: "user" } }, error: null }) },
  from(table) {
    let insert,
      filters = {};
    const q = {
      select() {
        return q;
      },
      eq(k, v) {
        filters[k] = v;
        return q;
      },
      order() {
        return q;
      },
      limit() {
        return q;
      },
      insert(value) {
        insert = value;
        return q;
      },
      maybeSingle() {
        return q;
      },
      single() {
        return q;
      },
      then(resolve, reject) {
        let result;
        if (table === "order_chats") {
          if (insert) {
            r.chatInserts++;
            if (r.conflict) {
              r.chatExists = true;
              result = { data: null, error: { code: "23505" } };
            } else {
              r.chatExists = true;
              result = { data: { id: "chat-" + r.props.orderId }, error: null };
            }
          } else {
            r.chatReads++;
            result = r.chatError
              ? { data: null, error: { message: "read failed" } }
              : { data: r.chatExists ? { id: "chat-" + r.props.orderId } : null, error: null };
          }
        } else if (insert) {
          r.sends.push(insert);
          if (r.throwSend) return Promise.reject(Error("offline")).then(resolve, reject);
          if (r.sendError) result = { data: null, error: { message: "offline" } };
          else if (r.messages.some((m) => m.id === insert.id))
            result = { data: null, error: { code: "23505" } };
          else {
            const row = {
              id: insert.id ?? "server-message",
              created_at: new Date().toISOString(),
              ...insert,
            };
            r.messages.push(row);
            result = r.loseResponse
              ? { data: null, error: { message: "response lost" } }
              : { data: row, error: null };
          }
          if (r.deferSend) {
            r.resolveSend = () => resolve(result);
            return;
          }
        } else {
          r.messageReads++;
          const rows = r.messages.filter((m) =>
            Object.entries(filters).every(([k, v]) => m[k] === v),
          );
          result = r.messageError
            ? { data: null, error: { message: "offline" } }
            : { data: filters.id ? (rows[0] ?? null) : [...rows], error: null };
          if (r.deferReads) {
            r.pendingReads.push(() => resolve(result));
            return;
          }
        }
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return q;
  },
  storage: {
    from() {
      return {
        createSignedUrl: async () => ({ data: null, error: null }),
        upload: async () => {
          if (r.throwUpload) throw Error("offline");
          return { error: null };
        },
      };
    },
  },
  channel() {
    const c = {
      on(t, f, fn) {
        r.handler = fn;
        return c;
      },
      subscribe(fn) {
        r.subscribed = fn;
        return c;
      },
    };
    return c;
  },
  removeChannel() {
    r.removed++;
  },
};
const hooks = registerHooks({
  resolve(n, c, next) {
    if (n === "react" && !c.parentURL?.endsWith("/order-chat.tsx")) return next(n, c);
    return modules[n]
      ? { url: "data:text/javascript," + encodeURIComponent(modules[n]), shortCircuit: true }
      : next(n, c);
  },
});
const { OrderChat } = await import("../src/components/order-chat.tsx");
hooks.deregister();
jsx.deregister();
function nodes(n) {
  return n && typeof n === "object"
    ? [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)]
    : [];
}
function text(n) {
  return typeof n === "string"
    ? n
    : n && typeof n === "object"
      ? [n.props?.children].flat(Infinity).map(text).join(" ")
      : "";
}
const settle = () => new Promise((done) => setImmediate(done));
async function mount(options = {}) {
  Object.assign(r, {
    states: [],
    cursor: 0,
    effects: [],
    errors: [],
    messages: [],
    sends: [],
    chatExists: true,
    chatError: false,
    chatInserts: 0,
    chatReads: 0,
    messageReads: 0,
    removed: 0,
    pendingReads: [],
    sendError: false,
    throwSend: false,
    loseResponse: false,
    throwUpload: false,
    deferSend: false,
    deferReads: false,
    conflict: false,
    props: { orderId: "order", escopo: "client_courier", myRole: "cliente" },
    ...options,
  });
  const previous = { window: globalThis.window, document: globalThis.document };
  globalThis.window = Object.assign(new EventTarget(), { setInterval, clearInterval });
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const render = () => {
    r.cursor = 0;
    const tree = OrderChat(r.props);
    r.effects.splice(0).forEach((fn) => fn());
    return tree;
  };
  const flush = async () => {
    for (let i = 0; i < 5; i++) {
      render();
      await settle();
    }
    return render();
  };
  const app = {
    render,
    flush,
    input: () => nodes(render()).find((n) => n.props?.placeholder === "Escreva uma mensagem…"),
    send: () =>
      nodes(render())
        .find((n) => n.props?.["aria-label"] === "Enviar mensagem")
        .props.onClick(),
    type(value) {
      this.input().props.onChange({ target: { value } });
    },
    cleanup() {
      r.states.forEach((s) => s?.cleanup?.());
      globalThis.window = previous.window;
      globalThis.document = previous.document;
    },
  };
  await flush();
  return app;
}
test("a successful send appears immediately without any realtime echo", async () => {
  const app = await mount();
  try {
    app.type("Minha mensagem");
    await app.send();
    await app.flush();
    assert.match(text(app.render()), /Minha mensagem/);
    assert.equal(app.input().props.value, "");
    assert.equal(r.sends.length, 1);
  } finally {
    app.cleanup();
  }
});
test("a failed send preserves the draft and permits retry", async () => {
  const app = await mount({ sendError: true });
  try {
    app.type("Não perder");
    await app.send();
    assert.equal(app.input().props.value, "Não perder");
    r.sendError = false;
    await app.send();
    await app.flush();
    assert.match(text(app.render()), /Não perder/);
    assert.equal(app.input().props.disabled, false);
  } finally {
    app.cleanup();
  }
});
test("a thrown transport failure releases pending controls", async () => {
  const app = await mount({ throwSend: true });
  try {
    app.type("Retry");
    await app.send();
    assert.equal(app.input().props.disabled, false);
    assert.equal(app.input().props.value, "Retry");
    assert.ok(r.errors.length);
  } finally {
    app.cleanup();
  }
});
test("a rapid repeated click cannot send the same draft twice", async () => {
  const app = await mount({ deferSend: true });
  try {
    app.type("Uma vez");
    const pending = app.send();
    await settle();
    const repeated = app.send();
    await settle();
    assert.equal(r.sends.length, 1);
    r.resolveSend();
    await Promise.all([pending, repeated]);
  } finally {
    app.cleanup();
  }
});
test("concurrent chat creation recovers the winning scoped conversation", async () => {
  const app = await mount({ chatExists: false, conflict: true });
  try {
    assert.equal(r.errors.length, 0);
    assert.ok(app.input());
    app.type("Oi");
    await app.send();
    assert.equal(r.sends[0].chat_id, "chat-order");
  } finally {
    app.cleanup();
  }
});
test("a failed chat lookup shows retry without attempting an insert", async () => {
  const app = await mount({ chatError: true });
  try {
    assert.equal(r.chatInserts, 0);
    assert.ok(
      nodes(app.render()).some((n) => n.type === "button" && text(n).includes("Tentar novamente")),
    );
    assert.ok(!app.input() || app.input().props.disabled);
  } finally {
    app.cleanup();
  }
});
test("a slow snapshot cannot erase a newly arrived message", async () => {
  const app = await mount();
  try {
    r.deferReads = true;
    window.dispatchEvent(new Event("focus"));
    await settle();
    r.deferReads = false;
    await r.handler({
      new: {
        id: "incoming",
        chat_id: "chat-order",
        sender_id: "other",
        tipo: "text",
        conteudo: "Cheguei",
        anexo_url: null,
        created_at: new Date().toISOString(),
      },
    });
    r.pendingReads.splice(0).forEach((resolve) => resolve());
    await app.flush();
    assert.match(text(app.render()), /Cheguei/);
  } finally {
    app.cleanup();
  }
});
test("connection resume and subscription readiness reconcile messages", async () => {
  const app = await mount();
  try {
    for (const event of ["online", "pageshow"]) {
      const before = r.messageReads;
      window.dispatchEvent(new Event(event));
      await app.flush();
      assert.ok(r.messageReads > before, event);
    }
    assert.equal(typeof r.subscribed, "function");
    const before = r.messageReads;
    r.subscribed("SUBSCRIBED");
    await app.flush();
    assert.ok(r.messageReads > before);
  } finally {
    app.cleanup();
  }
});

test("an upload transport failure releases controls without posting a message", async () => {
  const app = await mount({ throwUpload: true });
  try {
    const fileInput = nodes(app.render()).find((n) => n.props?.type === "file");
    await fileInput.props.onChange({ target: { files: [{ name: "foto.png" }] } });
    assert.equal(app.input().props.disabled, false);
    assert.equal(r.sends.length, 0);
    assert.ok(r.errors.length);
  } finally {
    app.cleanup();
  }
});

test("a send resolved after changing orders cannot leak into the next conversation", async () => {
  const app = await mount({ deferSend: true });
  try {
    app.type("Pedido antigo");
    const pending = app.send();
    await settle();
    const resolve = r.resolveSend;
    r.props = { ...r.props, orderId: "other" };
    await app.flush();
    resolve();
    await pending;
    await app.flush();
    assert.doesNotMatch(text(app.render()), /Pedido antigo/);
    assert.equal(app.input().props.disabled, false);
  } finally {
    app.cleanup();
  }
});

test("a lost response retry recovers the existing message without creating another", async () => {
  const app = await mount({ loseResponse: true });
  try {
    app.type("Sem duplicar");
    await app.send();
    assert.equal(app.input().props.value, "Sem duplicar");
    r.loseResponse = false;
    await app.send();
    await app.flush();
    assert.equal(r.messages.length, 1);
    assert.equal(r.sends.length, 2);
    assert.equal(r.sends[0].id, r.sends[1].id);
    assert.match(text(app.render()), /Sem duplicar/);
  } finally {
    app.cleanup();
  }
});
