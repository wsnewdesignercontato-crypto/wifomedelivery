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
