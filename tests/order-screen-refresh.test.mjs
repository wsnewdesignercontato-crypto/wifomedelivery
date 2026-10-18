import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";

const runtime = { states: [], cursor: 0, effects: [] };
globalThis.__orderRefreshTest = runtime;
const jsx = loadTsx();
const react = import.meta.resolve("react");
const modules = {
  react: `export * from ${JSON.stringify(react)};
    const r=globalThis.__orderRefreshTest;
    export function useState(initial){const i=r.cursor++;if(!(i in r.states))r.states[i]=typeof initial==='function'?initial():initial;return[r.states[i],value=>{r.writes++;r.states[i]=typeof value==='function'?value(r.states[i]):value}]}
    export function useRef(initial){const i=r.cursor++;return r.states[i]??=( {current:initial} )}
    export function useEffect(fn,deps){const i=r.cursor++;const old=r.states[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){const state={deps};r.states[i]=state;r.effects.push(()=>{old?.cleanup?.();state.cleanup=fn()})}}`,
  "@tanstack/react-router": `const r=globalThis.__orderRefreshTest;export const Link='a';export const useNavigate=()=>()=>{};export const createFileRoute=()=>options=>({...options,useParams:()=>({id:r.orderId}),useRouteContext:()=>({user:{id:r.userId}})});`,
  "@/integrations/supabase/client": "export const supabase=globalThis.__orderRefreshTest.client;",
  sonner: "export const toast={error(){},success(){},info(){}};",
  "@/hooks/use-my-estab":
    "export const useMyEstab=()=>({estab:globalThis.__orderRefreshTest.estab});export const fmt=n=>String(n);",
  "@/hooks/use-courier":
    "export const useMyCourier=()=>({courier:globalThis.__orderRefreshTest.courier});export const fmt=n=>String(n);",
  "@tanstack/react-query": "export const useQueryClient=()=>({invalidateQueries(){}});",
  "@/components/score-card": "export const ScoreCard='aside';",
  "@/components/order-chat": "export const OrderChat='aside';",
  "@/components/sos-button": "export const SOSButton='aside';",
  "@/lib/device-preferences":
    "export function getCurrentDevicePosition(){};export function watchDeviceLocation(){return ()=>{}};",
  "@/components/reviews": "export const ReviewForm='form';",
  "@/components/order-history": "export const OrderHistory='aside';",
  "@/lib/delivery-dispatch": "export async function dispatchOrderDelivery(){}",
  "@/lib/print-receipt":
    "export function printOrderReceipt(...args){globalThis.__orderRefreshTest.printed=args;return true}export function buildReceiptHtml(){return ''}",
};
for (const [name, exports] of Object.entries({
  button: ["Button"],
  badge: ["Badge"],
  switch: ["Switch"],
  input: ["Input"],
  label: ["Label"],
  dialog: [
    "Dialog",
    "DialogContent",
    "DialogHeader",
    "DialogTitle",
    "DialogTrigger",
    "DialogFooter",
    "DialogDescription",
  ],
  sheet: ["Sheet", "SheetContent", "SheetHeader", "SheetTitle"],
}))
  modules[`@/components/ui/${name}`] = exports
    .map(
      (key) =>
        `export const ${key}='${key === "Button" ? "button" : key === "Badge" ? "mark" : "div"}';`,
    )
    .join("");

runtime.client = {
  from(table) {
    let single = false;
    const equalities = {};
    const query = {
      select: () => query,
      eq(key, value) {
        equalities[key] = value;
        return query;
      },
      or: () => query,
      not: () => query,
      gte: () => query,
      in: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle() {
        single = true;
        return query;
      },
      single() {
        single = true;
        return query;
      },
      then(resolve, reject) {
        const order = { ...runtime.order };
        const values = {
          orders: single ? order : [order],
          establishments: single
            ? { id: "store", nome: "Loja teste" }
            : [{ id: "store", nome: "Loja teste" }],
          order_items: [
            {
              id: "item",
              order_id: "order-1",
              nome_snapshot: "Almoço",
              preco_unit_cents: 1000,
              quantidade: 1,
              observacoes: null,
              addons: [],
            },
          ],
          deliveries: {
            id: "delivery",
            status: order.status,
            entregador_id: "courier",
            lat: -20,
            lng: -43,
          },
          reviews: null,
          profiles: { nome: "Cliente teste", telefone: "31999990000" },
        };
        const isCourier = runtime.screen === "rides" || runtime.screen === "courierHome";
        if (isCourier && table === "deliveries")
          values.deliveries = single
            ? runtime.activeDelivery
              ? { ...runtime.activeDelivery }
              : null
            : equalities.status === "broadcasting"
              ? runtime.availableDeliveries
              : [];
        const error =
          (table === "orders" && runtime.orderReadError) ||
          ((table === "orders" || (isCourier && table === "deliveries")) && runtime.readError)
            ? { message: "offline" }
            : null;
        const result = { data: error ? null : (values[table] ?? (single ? null : [])), error };
        if (isCourier && table === "deliveries" && single && runtime.deferNextDelivery) {
          runtime.deferNextDelivery = false;
          return new Promise((done) => {
            runtime.resolveDelivery = () => done(result);
          }).then(resolve, reject);
        }
        if (table === "orders" && runtime.deferNextOrder) {
          runtime.deferNextOrder = false;
          return new Promise((done) => {
            runtime.resolveOrder = () => done(result);
          }).then(resolve, reject);
        }
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return query;
  },
  rpc(name) {
    return Promise.resolve({
      data:
        name === "get_order_client_contact"
          ? [{ nome: "Cliente teste", telefone: "31999990000" }]
          : { codigo_entrega: "1234" },
      error: null,
    });
  },
  channel() {
    const channel = {
      handlers: [],
      on(type, filter, callback) {
        channel.handlers.push({ filter, callback });
        return channel;
      },
      subscribe(callback) {
        channel.status = callback;
        return channel;
      },
    };
    runtime.channel = channel;
    return channel;
  },
  removeChannel() {},
};
const hooks = registerHooks({
  resolve(name, context, next) {
    if (name === "react" && !context.parentURL?.includes("/src/routes/"))
      return next(name, context);
    if (modules[name])
      return {
        url: "data:text/javascript," + encodeURIComponent(modules[name]),
        shortCircuit: true,
      };
    return next(name, context);
  },
});
const routes = {
  detail: (await import("../src/routes/_authenticated/cliente.pedido.$id.tsx")).Route,
  customer: (await import("../src/routes/_authenticated/cliente.pedidos.tsx")).Route,
  store: (await import("../src/routes/_authenticated/estabelecimento.pedidos.tsx")).Route,
  rides: (await import("../src/routes/_authenticated/entregador.corridas.tsx")).Route,
  courierHome: (await import("../src/routes/_authenticated/entregador.index.tsx")).Route,
};
hooks.deregister();
jsx.deregister();

function nodes(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}
function texts(node) {
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (!node || typeof node !== "object") return [];
  return [node.props?.children].flat(Infinity).flatMap(texts);
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
async function mount(name, status = "placed") {
  Object.assign(runtime, {
    states: [],
    cursor: 0,
    effects: [],
    writes: 0,
    orderId: "order-1",
    userId: "customer",
    estab: { id: "store", nome: "Loja teste", printer_enabled: false, printer_auto: false },
    order: {
      id: "order-1",
      cliente_id: "customer",
      establishment_id: "store",
      status,
      total_cents: 1000,
      subtotal_cents: 1000,
      frete_cents: 0,
      desconto_cents: 0,
      created_at: "2026-10-18T12:00:00Z",
      tipo_entrega: "delivery",
      forma_pagamento: "pix",
      observacoes: null,
    },
    deferNextOrder: false,
    resolveOrder: null,
    readError: false,
    orderReadError: false,
    screen: name,
    courier: {
      user_id: "courier",
      status: "online",
      aprovacao: "aprovado",
      kyc_status: "approved",
    },
    activeDelivery: {
      id: "delivery",
      order_id: "order-1",
      status: "accepted",
      entregador_id: "courier",
      valor_entrega_cents: 500,
    },
    deferNextDelivery: false,
    resolveDelivery: null,
    availableDeliveries: [],
  });
  const previousWindow = globalThis.window,
    previousDocument = globalThis.document;
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const render = () => {
    runtime.cursor = 0;
    return routes[name].component();
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
function hasCurrentStatus(app, name, label) {
  const tree = app.render();
  if (name !== "detail")
    return nodes(tree).some((node) => node.type === "mark" && node.props.children === label);
  return nodes(tree).some(
    (node) => node.props?.children === label && node.props?.className?.includes("font-bold"),
  );
}

for (const [status, label] of [
  ["waiting_courier", "Aguardando entregador"],
  ["arriving", "Chegando"],
]) {
  test(`customer tracking marks ${status} as the current delivery stage`, async () => {
    const app = await mount("detail", status);
    try {
      assert.ok(hasCurrentStatus(app, "detail", label));
    } finally {
      app.cleanup();
    }
  });
}

for (const name of ["detail", "customer", "store"]) {
  for (const trigger of [
    "focus",
    "online",
    "pageshow",
    "visibilitychange",
    "SUBSCRIBED",
    "reconnect",
  ]) {
    test(`${name} catches a missed order update on ${trigger}`, async () => {
      const app = await mount(name);
      try {
        if (trigger === "reconnect") runtime.channel.status?.("CHANNEL_ERROR");
        runtime.order.status = "preparing";
        if (trigger === "SUBSCRIBED" || trigger === "reconnect")
          runtime.channel.status?.("SUBSCRIBED");
        else
          (trigger === "visibilitychange" ? globalThis.document : globalThis.window).dispatchEvent(
            new Event(trigger),
          );
        await settle();
        assert.ok(hasCurrentStatus(app, name, "Em preparo"));
      } finally {
        app.cleanup();
      }
    });
  }

  test(`${name} keeps the latest order when an older refresh finishes last`, async () => {
    const app = await mount(name);
    try {
      runtime.order.status = "accepted";
      runtime.deferNextOrder = true;
      globalThis.window.dispatchEvent(new Event("focus"));
      await settle();
      assert.equal(typeof runtime.resolveOrder, "function");
      runtime.order.status = "preparing";
      globalThis.window.dispatchEvent(new Event("online"));
      await settle();
      assert.ok(hasCurrentStatus(app, name, "Em preparo"));
      runtime.resolveOrder();
      await settle();
      assert.ok(hasCurrentStatus(app, name, "Em preparo"));
    } finally {
      app.cleanup();
    }
  });

  test(`${name} ignores a pending response and resume events after unmount`, async () => {
    const app = await mount(name);
    runtime.deferNextOrder = true;
    runtime.channel.handlers
      .find((h) => h.filter.table === "orders")
      .callback({ eventType: "UPDATE", new: runtime.order });
    await settle();
    assert.equal(typeof runtime.resolveOrder, "function");
    const oldWindow = globalThis.window,
      oldChannel = runtime.channel;
    app.cleanup();
    const writes = runtime.writes;
    runtime.resolveOrder();
    oldWindow.dispatchEvent(new Event("focus"));
    oldChannel.status?.("SUBSCRIBED");
    await settle();
    assert.equal(runtime.writes, writes);
  });

  test(`${name} preserves its loaded order when a resume read fails`, async () => {
    const app = await mount(name, "preparing");
    try {
      runtime.readError = true;
      runtime.order.status = "accepted";
      globalThis.window.dispatchEvent(new Event("focus"));
      await settle();
      assert.ok(hasCurrentStatus(app, name, "Em preparo"));
    } finally {
      app.cleanup();
    }
  });

  test(`${name} does not reload orders merely because the app becomes hidden`, async () => {
    const app = await mount(name);
    try {
      runtime.order.status = "preparing";
      globalThis.document.visibilityState = "hidden";
      globalThis.document.dispatchEvent(new Event("visibilitychange"));
      await settle();
      assert.equal(hasCurrentStatus(app, name, "Em preparo"), false);
      globalThis.document.visibilityState = "visible";
      globalThis.document.dispatchEvent(new Event("visibilitychange"));
      await settle();
      assert.ok(hasCurrentStatus(app, name, "Em preparo"));
    } finally {
      app.cleanup();
    }
  });

  test(`${name} clears the previous scope while a new scope cannot be read`, async () => {
    const app = await mount(name, "preparing");
    try {
      runtime.readError = true;
      if (name === "detail") runtime.orderId = "another-order";
      else if (name === "customer") runtime.userId = "another-customer";
      else runtime.estab = { ...runtime.estab, id: "another-store" };
      app.render();
      app.commitEffects();
      await settle();
      assert.equal(hasCurrentStatus(app, name, "Em preparo"), false);
      assert.ok(!texts(app.render()).includes("Cliente teste"));
    } finally {
      app.cleanup();
    }
  });
}

test("store resume refresh preserves client contact and receipt printing", async () => {
  const app = await mount("store");
  try {
    runtime.order.status = "preparing";
    globalThis.window.dispatchEvent(new Event("pageshow"));
    await settle();
    assert.ok(texts(app.render()).includes("Cliente teste"));
    const printButton = nodes(app.render()).find(
      (node) => node.type === "button" && texts(node).includes("Imprimir"),
    );
    assert.ok(printButton, "the receipt action remains available");
    await printButton.props.onClick();
    assert.equal(runtime.printed[0].status, "preparing");
    assert.equal(runtime.printed[3].telefone, "31999990000");
  } finally {
    app.cleanup();
  }
});

function courierAtCustomer(app) {
  return texts(app.render()).includes("No cliente");
}

for (const name of ["rides", "courierHome"]) {
  for (const trigger of [
    "focus",
    "online",
    "pageshow",
    "visibilitychange",
    "SUBSCRIBED",
    "reconnect",
  ]) {
    test(`${name} catches a missed delivery update on ${trigger}`, async () => {
      const app = await mount(name);
      try {
        if (trigger === "reconnect") runtime.channel.status?.("CHANNEL_ERROR");
        runtime.activeDelivery.status = "at_customer";
        if (trigger === "SUBSCRIBED" || trigger === "reconnect")
          runtime.channel.status?.("SUBSCRIBED");
        else
          (trigger === "visibilitychange" ? globalThis.document : globalThis.window).dispatchEvent(
            new Event(trigger),
          );
        await settle();
        assert.ok(courierAtCustomer(app));
      } finally {
        app.cleanup();
      }
    });
  }
  test(`${name} ignores an older active delivery response after a newer refresh`, async () => {
    const app = await mount(name);
    try {
      runtime.deferNextDelivery = true;
      globalThis.window.dispatchEvent(new Event("focus"));
      await settle();
      assert.equal(typeof runtime.resolveDelivery, "function");
      runtime.activeDelivery.status = "at_customer";
      globalThis.window.dispatchEvent(new Event("online"));
      await settle();
      assert.ok(courierAtCustomer(app));
      runtime.resolveDelivery();
      await settle();
      assert.ok(courierAtCustomer(app));
    } finally {
      app.cleanup();
    }
  });
  test(`${name} stops pending delivery reads and callbacks after unmount`, async () => {
    const app = await mount(name);
    runtime.deferNextDelivery = true;
    runtime.channel.handlers.find((h) => h.filter.table === "deliveries").callback();
    await settle();
    assert.equal(typeof runtime.resolveDelivery, "function");
    const oldChannel = runtime.channel;
    app.cleanup();
    const writes = runtime.writes;
    runtime.resolveDelivery();
    oldChannel.status?.("SUBSCRIBED");
    await settle();
    assert.equal(runtime.writes, writes);
  });
  test(`${name} retains an active delivery during a failed resume read`, async () => {
    const app = await mount(name);
    try {
      runtime.readError = true;
      globalThis.window.dispatchEvent(new Event("focus"));
      await settle();
      assert.ok(texts(app.render()).includes("Corrida ativa"));
    } finally {
      app.cleanup();
    }
  });
  test(`${name} removes a delivery completed while the app was suspended`, async () => {
    const app = await mount(name);
    try {
      assert.ok(texts(app.render()).includes("Corrida ativa"));
      runtime.activeDelivery = null;
      globalThis.window.dispatchEvent(new Event("pageshow"));
      await settle();
      assert.ok(!texts(app.render()).includes("Corrida ativa"));
      assert.ok(!texts(app.render()).includes("Cliente teste"));
    } finally {
      app.cleanup();
    }
  });
  test(`${name} discovers a delivery broadcast while the app was disconnected`, async () => {
    const app = await mount(name);
    try {
      runtime.activeDelivery = null;
      runtime.availableDeliveries = [
        {
          id: "available",
          order_id: "order-2",
          status: "broadcasting",
          entregador_id: null,
          valor_entrega_cents: 500,
        },
      ];
      runtime.channel.status?.("SUBSCRIBED");
      await settle();
      assert.ok(
        nodes(app.render()).some(
          (node) => node.type === "button" && texts(node).includes("Aceitar corrida"),
        ),
      );
    } finally {
      app.cleanup();
    }
  });
  test(`${name} clears the previous courier's data when the account changes`, async () => {
    const app = await mount(name);
    try {
      runtime.courier = { ...runtime.courier, user_id: "another-courier" };
      runtime.readError = true;
      app.render();
      app.commitEffects();
      await settle();
      assert.ok(!texts(app.render()).includes("Corrida ativa"));
      assert.ok(!texts(app.render()).includes("Cliente teste"));
    } finally {
      app.cleanup();
    }
  });
  test(`${name} clears the previous order's details if the next active order read fails`, async () => {
    const app = await mount(name);
    try {
      assert.ok(texts(app.render()).includes("Loja teste"));
      runtime.activeDelivery = {
        ...runtime.activeDelivery,
        order_id: "order-2",
        status: "at_customer",
      };
      runtime.orderReadError = true;
      globalThis.window.dispatchEvent(new Event("focus"));
      await settle();
      assert.ok(courierAtCustomer(app));
      assert.ok(!texts(app.render()).includes("Loja teste"));
      assert.ok(!texts(app.render()).includes("Cliente teste"));
    } finally {
      app.cleanup();
    }
  });
  test(`${name} keeps the current order's details if that same order read fails`, async () => {
    const app = await mount(name);
    try {
      runtime.orderReadError = true;
      globalThis.window.dispatchEvent(new Event("focus"));
      await settle();
      assert.ok(texts(app.render()).includes("Loja teste"));
    } finally {
      app.cleanup();
    }
  });
}
