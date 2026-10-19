import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/push-sw.js", import.meta.url), "utf8");
function worker(clients) {
  const handlers = {},
    calls = [];
  const self = {
    location: { origin: "https://pedetrem.vercel.app" },
    navigator: {},
    registration: {
      showNotification: async (title, options) => calls.push(["notification", title, options]),
    },
    clients: {
      matchAll: async () => clients,
      openWindow: async (url) => calls.push(["open", url]),
    },
    addEventListener: (name, handler) => {
      handlers[name] = handler;
    },
  };
  vm.runInNewContext(source, { self, URL });
  return {
    calls,
    async push(payload) {
      let finished;
      handlers.push({
        data: { json: () => payload },
        waitUntil(promise) {
          finished = promise;
        },
      });
      await finished;
    },
    async click(url) {
      let finished;
      handlers.notificationclick({
        notification: { close() {}, data: { url } },
        waitUntil(promise) {
          finished = promise;
        },
      });
      await finished;
    },
  };
}
test("a store notification never navigates the installed customer app", async () => {
  const calls = [];
  const client = (role) => ({
    url: `https://pedetrem.vercel.app/${role}`,
    focus: async () => calls.push(["focus", role]),
    navigate: async (url) => calls.push(["navigate", role, url]),
  });
  const service = worker([client("cliente"), client("estabelecimento")]);
  await service.click("/estabelecimento/pedidos");
  assert.deepEqual(calls, [
    ["focus", "estabelecimento"],
    ["navigate", "estabelecimento", "/estabelecimento/pedidos"],
  ]);
  assert.deepEqual(service.calls, []);
});
test("a courier notification opens its own scope when only a customer window exists", async () => {
  const service = worker([
    {
      url: "https://pedetrem.vercel.app/cliente",
      focus() {
        throw new Error("Wrong app was focused");
      },
    },
  ]);
  await service.click("/entregador/corridas");
  assert.deepEqual(service.calls, [["open", "/entregador/corridas"]]);
});

test("background push displays an audible store alert even without an open app window", async () => {
  const service = worker([]);
  await service.push({
    title: "Novo pedido",
    body: "Atenda seu pedido",
    url: "/estabelecimento/pedidos",
    tag: "order-test",
  });
  const [kind, title, options] = service.calls[0];
  assert.equal(kind, "notification");
  assert.equal(title, "Novo pedido");
  assert.equal(options.silent, false);
  assert.equal(options.requireInteraction, true);
  assert.match(options.icon, /estabelecimento/);
});
test("background courier push uses its own icon and opens the offer list", async () => {
  const service = worker([]);
  await service.push({ title: "Nova corrida", url: "/entregador/corridas" });
  assert.match(service.calls[0][2].icon, /entregador/);
  assert.equal(service.calls[0][2].data.url, "/entregador/corridas");
});

test("push wakes only matching app windows and never navigates another profile", async () => {
  const messages = [];
  const page = (role) => ({
    url: "https://pedetrem.vercel.app/" + role,
    postMessage: (data) => messages.push([role, data.type]),
  });
  const service = worker([page("cliente"), page("entregador"), page("estabelecimento")]);
  await service.push({ title: "Nova corrida", url: "/entregador/corridas" });
  assert.deepEqual(messages, [["entregador", "pedetrem:push-received"]]);
});
