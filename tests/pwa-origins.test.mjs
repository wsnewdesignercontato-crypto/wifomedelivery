import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { APP_PROFILES } from "../src/lib/app-profiles.ts";

test("each phone app has its own origin so an installed app cannot capture another app's install page", () => {
  assert.equal(new Set(Object.values(APP_PROFILES).map((app) => app.origin)).size, 3);
  assert.equal(APP_PROFILES.cliente.origin, "https://pedetrem.vercel.app");
  assert.equal(APP_PROFILES.estabelecimento.origin, "https://pedetrem-loja.vercel.app");
  assert.equal(APP_PROFILES.entregador.origin, "https://pedetrem-entregador.vercel.app");
});

test("a store prompt on the shared customer origin is rejected even with a matching manifest", async () => {
  const hooks = registerHooks({
    resolve(name, context, next) {
      if (name === "./app-profiles")
        return {
          url: new URL("../src/lib/app-profiles.ts", import.meta.url).href,
          shortCircuit: true,
        };
      return next(name, context);
    },
  });
  try {
    globalThis.document = {
      querySelector: () => ({ getAttribute: () => "/manifest-estabelecimento.webmanifest" }),
    };
    globalThis.window = {
      location: { origin: "https://pedetrem.vercel.app", pathname: "/estabelecimento/entrar" },
    };
    const shared = await import("../src/lib/install-document.ts?shared-origin-store");
    assert.equal(shared.isProfileInstallDocument("estabelecimento"), false);
    globalThis.window.location.origin = "https://pedetrem-loja.vercel.app";
    const isolated = await import("../src/lib/install-document.ts?isolated-origin-store");
    assert.equal(isolated.isProfileInstallDocument("estabelecimento"), true);
    assert.equal(isolated.isProfileInstallDocument("cliente"), false);
  } finally {
    hooks.deregister();
    delete globalThis.document;
    delete globalThis.window;
  }
});
