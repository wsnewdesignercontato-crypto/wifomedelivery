import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { APP_PROFILES, systemInstallationEvidence } from "../src/lib/app-profiles.ts";
import { RUNNING_APP_KEY } from "../src/lib/pwa-launch.ts";
import { loadTsx } from "./helpers/load-tsx.mjs";

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const aliases = loadTsx();
const relative = registerHooks({
  resolve(name, context, next) {
    if (name === "./app-profiles")
      return {
        url: new URL("../src/lib/app-profiles.ts", import.meta.url).href,
        shortCircuit: true,
      };
    return next(name, context);
  },
});
const { perfilInstaladoEmExecucao } = await import("../src/hooks/use-app-instalado.ts");
relative.deregister();
aliases.deregister();

afterEach(() => {
  delete globalThis.window;
  delete globalThis.sessionStorage;
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else delete globalThis.navigator;
});

function browser(profile, { standalone = true, search = "", values = new Map() } = {}) {
  const sessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  globalThis.window = {
    location: {
      origin: APP_PROFILES[profile].origin,
      pathname: APP_PROFILES[profile].loginPath,
      search,
    },
    matchMedia: () => ({ matches: standalone }),
    sessionStorage,
  };
  globalThis.sessionStorage = sessionStorage;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { standalone },
  });
  return values;
}

test("opening store or courier from an app window does not mean that app is installed", () => {
  for (const profile of ["estabelecimento", "entregador"]) {
    browser(profile);
    assert.equal(perfilInstaladoEmExecucao(), null);
  }
});

test("installing the customer never hides either of the other installation offers", async () => {
  const values = browser("cliente", { search: "?app=cliente" });
  assert.equal(perfilInstaladoEmExecucao(), "cliente");
  assert.equal(values.get(RUNNING_APP_KEY), "cliente");
  for (const profile of ["estabelecimento", "entregador"]) {
    browser(profile, { values });
    const running = perfilInstaladoEmExecucao();
    assert.equal(running, null);
    const installed = await systemInstallationEvidence(
      profile,
      APP_PROFILES[profile].origin,
      running,
      async () => [
        {
          platform: "webapp",
          id: APP_PROFILES.cliente.origin + APP_PROFILES.cliente.id,
          url: APP_PROFILES.cliente.origin + APP_PROFILES.cliente.manifest,
        },
      ],
    );
    assert.equal(installed, false);
  }
});

test("matching app launches stay recognized after internal navigation, independently per app", () => {
  for (const profile of Object.keys(APP_PROFILES)) {
    const values = browser(profile, { search: "?app=" + profile });
    assert.equal(perfilInstaladoEmExecucao(), profile);
    browser(profile, { values });
    assert.equal(perfilInstaladoEmExecucao(), profile);
    browser(profile, { values, standalone: false });
    assert.equal(perfilInstaladoEmExecucao(), null);
  }
});

test("old page-derived installation flags do not count as verified app launches", () => {
  const values = new Map([["pedetrem:running-app", "entregador"]]);
  browser("entregador", { values });
  assert.equal(perfilInstaladoEmExecucao(), null);
});

test("a launch marker for another origin cannot hide this profile's offer", () => {
  browser("entregador", { search: "?app=cliente" });
  assert.equal(perfilInstaladoEmExecucao(), null);
});

test("a normal browser visit is not an installed app even with a launch marker", () => {
  browser("cliente", { standalone: false, search: "?app=cliente" });
  assert.equal(perfilInstaladoEmExecucao(), null);
});

test("a matching launch still works when browser storage is blocked", () => {
  browser("entregador", { search: "?app=entregador" });
  window.sessionStorage.getItem = () => {
    throw Error("blocked");
  };
  window.sessionStorage.setItem = () => {
    throw Error("blocked");
  };
  assert.equal(perfilInstaladoEmExecucao(), "entregador");
});
