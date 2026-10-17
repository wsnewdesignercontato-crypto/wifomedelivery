import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { APP_PROFILES } from "../src/lib/app-profiles.ts";
const module = await import("../src/lib/pwa-installation.ts").catch((error) => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return null;
  throw error;
});
afterEach(() => {
  delete globalThis.window;
});
function storage() {
  const values = new Map();
  globalThis.window = Object.assign(new EventTarget(), {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  });
  return values;
}
test("install evidence and stable device IDs belong to one app and its own origin", () => {
  assert.ok(module);
  storage();
  const origin = APP_PROFILES.cliente.origin;
  assert.equal(
    module.observePwaInstallation("estabelecimento", origin, true, "appinstalled"),
    null,
  );
  const proof = module.observePwaInstallation("cliente", origin, true, "appinstalled");
  assert.equal(proof.installed, true);
  assert.equal(module.currentPwaInstallation("estabelecimento"), null);
  const id = module.pwaInstallationId("cliente");
  assert.match(id, /^[a-f0-9-]{36}$/);
  assert.equal(module.pwaInstallationId("cliente"), id);
  assert.notEqual(module.pwaInstallationId("estabelecimento"), id);
});
test("native query can confirm removal without reusing a permanent installed flag", () => {
  assert.ok(module);
  storage();
  const origin = APP_PROFILES.entregador.origin;
  module.observePwaInstallation("entregador", origin, true, "standalone");
  assert.equal(module.observePwaInstallation("entregador", origin, false, "standalone"), null);
  assert.equal(
    module.observePwaInstallation("entregador", origin, false, "browser-query").installed,
    false,
  );
  assert.equal(module.currentPwaInstallation("entregador").installed, false);
});
test("a slow older backend observation cannot finish after the newer confirmation", async () => {
  const enqueue = module.createPwaInstallQueue();
  let release;
  const writes = [];
  const first = enqueue(async () => {
    await new Promise((resolve) => {
      release = resolve;
    });
    writes.push(false);
    throw Error("temporary network failure");
  });
  const rejected = assert.rejects(first);
  const next = enqueue(async () => {
    writes.push(true);
  });
  await Promise.resolve();
  assert.deepEqual(writes, []);
  release();
  await rejected;
  await next;
  assert.deepEqual(writes, [false, true]);
});
