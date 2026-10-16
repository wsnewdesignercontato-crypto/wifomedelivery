import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

test("SPA navigation cannot reuse an installation prompt loaded for another app", async () => {
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
    let manifest = "/manifest-cliente.webmanifest";
    globalThis.document = { querySelector: () => ({ getAttribute: () => manifest }) };
    globalThis.window = {
      location: { origin: "https://pedetrem.vercel.app", pathname: "/cliente/entrar" },
    };
    const first = await import("../src/lib/install-document.ts?initial-client");
    manifest = "/manifest-estabelecimento.webmanifest";
    globalThis.window.location.pathname = "/estabelecimento/entrar";
    assert.equal(first.isProfileInstallDocument("cliente"), true);
    assert.equal(first.isProfileInstallDocument("estabelecimento"), false);
    const secondDocument = await import("../src/lib/install-document.ts?fresh-store");
    assert.equal(secondDocument.isProfileInstallDocument("estabelecimento"), true);
    assert.equal(secondDocument.isProfileInstallDocument("cliente"), false);
  } finally {
    hooks.deregister();
    delete globalThis.document;
    delete globalThis.window;
  }
});
