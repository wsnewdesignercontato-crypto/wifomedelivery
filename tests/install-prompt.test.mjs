import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

test("an install offer arriving before the banner mounts remains available for the matching app", async () => {
  const hooks = registerHooks({
    resolve(name, context, next) {
      if (name === "./install-document" || name === "./app-profiles")
        return {
          url: new URL("../src/lib/" + name.slice(2) + ".ts", import.meta.url).href,
          shortCircuit: true,
        };
      return next(name, context);
    },
  });
  try {
    globalThis.window = Object.assign(new EventTarget(), {
      location: { origin: "https://pedetrem-loja.vercel.app", pathname: "/estabelecimento/entrar" },
    });
    globalThis.document = {
      querySelector: () => ({ getAttribute: () => "/manifest-estabelecimento.webmanifest" }),
    };
    const module = await import("../src/lib/install-prompt.ts").catch((error) => {
      if (error.code === "ERR_MODULE_NOT_FOUND") return null;
      throw error;
    });
    assert.ok(module, "Install offers must be retained before the banner's React effects run");
    const offer = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    globalThis.window.dispatchEvent(offer);
    assert.equal(offer.defaultPrevented, true);
    assert.equal(module.getInstallPrompt("estabelecimento"), offer);
    assert.equal(module.getInstallPrompt("cliente"), null);
    assert.equal(module.takeInstallPrompt("cliente"), null);
    assert.equal(module.takeInstallPrompt("estabelecimento"), offer);
    assert.equal(module.takeInstallPrompt("estabelecimento"), null);
    globalThis.window.dispatchEvent(offer);
    module.clearInstallPrompt();
    assert.equal(module.getInstallPrompt("estabelecimento"), null);
    globalThis.window.dispatchEvent(offer);
    globalThis.window.dispatchEvent(new Event("appinstalled"));
    assert.equal(module.getInstallPrompt("estabelecimento"), null);
  } finally {
    hooks.deregister();
    delete globalThis.window;
    delete globalThis.document;
  }
});
