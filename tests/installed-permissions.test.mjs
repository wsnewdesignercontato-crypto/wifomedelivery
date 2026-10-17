import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
afterEach(() => {
  delete globalThis.window;
  delete globalThis.Notification;
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else delete globalThis.navigator;
});

function browser({
  installed = true,
  notification = "default",
  location = "prompt",
  enabled = true,
} = {}) {
  const calls = { notification: 0, location: 0, queries: 0 };
  const values = new Map(enabled ? [] : [["wifome:location-enabled", "0"]]);
  const target = Object.assign(new EventTarget(), {
    matchMedia: () => ({ matches: installed }),
    PushManager: class {},
    localStorage: { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) },
  });
  globalThis.Notification = {
    permission: notification,
    requestPermission: async () => {
      calls.notification++;
      return "granted";
    },
  };
  target.Notification = globalThis.Notification;
  globalThis.window = target;
  const nav = {
    serviceWorker: {},
    permissions: {
      query: async () => {
        calls.queries++;
        return { state: location };
      },
    },
    geolocation: {
      getCurrentPosition: (ok) => {
        calls.location++;
        ok({ coords: { latitude: 1, longitude: 2 } });
      },
    },
  };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: nav });
  return { calls, values, nav };
}

async function permissions() {
  const module = await import("../src/lib/installed-permissions.ts").catch((error) => {
    if (error.code === "ERR_MODULE_NOT_FOUND") return null;
    throw error;
  });
  assert.ok(module, "Installed apps need a permission setup flow");
  return module;
}

test("normal browser visitors are never blocked or prompted by the installed-app setup", async () => {
  const { calls } = browser({ installed: false });
  const p = await permissions();
  assert.equal(p.needsInstalledPermissions(await p.readInstalledPermissions()), false);
  assert.deepEqual(calls, { notification: 0, location: 0, queries: 0 });
});

test("installed app setup detects missing real permissions and the app's location preference", async () => {
  const p = await permissions();
  for (const options of [
    { notification: "default", location: "granted" },
    { notification: "granted", location: "denied" },
    { notification: "granted", location: "granted", enabled: false },
  ]) {
    const { calls } = browser(options);
    assert.equal(p.needsInstalledPermissions(await p.readInstalledPermissions()), true);
    assert.equal(
      calls.notification + calls.location,
      0,
      "Reading state must not request permission",
    );
  }
  const { values } = browser({ notification: "granted", location: "granted" });
  values.set("pedetrem:push-enabled", "1");
  assert.equal(p.needsInstalledPermissions(await p.readInstalledPermissions()), false);
});

test("a revoked permission is read again rather than trusted from a permanent completion flag", async () => {
  const { nav, values } = browser({ notification: "granted", location: "granted" });
  values.set("pedetrem:push-enabled", "1");
  const p = await permissions();
  assert.equal(p.needsInstalledPermissions(await p.readInstalledPermissions()), false);
  globalThis.Notification.permission = "denied";
  nav.permissions.query = async () => ({ state: "denied" });
  assert.equal(p.needsInstalledPermissions(await p.readInstalledPermissions()), true);
  assert.equal(values.size, 1);
});

test("explicit notification activation requests once and does not re-prompt a blocked permission", async () => {
  const { calls } = browser();
  const p = await permissions();
  assert.equal(await p.requestInstalledNotifications(), "granted");
  assert.equal(calls.notification, 1);
  globalThis.Notification.permission = "denied";
  assert.equal(await p.requestInstalledNotifications(), "denied");
  assert.equal(calls.notification, 1);
});

test("successful explicit GPS activation enables the app preference without storing coordinates", async () => {
  const { calls, values } = browser({ enabled: false });
  const p = await permissions();
  assert.equal(await p.requestInstalledLocation(), "granted");
  assert.equal(calls.location, 1);
  assert.equal(values.get("wifome:location-enabled"), "1");
  assert.equal(
    [...values.values()].some((value) => value.includes("latitude")),
    false,
  );
});

test("denied or unavailable GPS never becomes a fake grant and unsupported APIs remain visible", async () => {
  const { nav } = browser();
  const p = await permissions();
  nav.geolocation.getCurrentPosition = (_, error) => error({ code: 1 });
  assert.equal(await p.requestInstalledLocation(), "denied");
  nav.geolocation.getCurrentPosition = (_, error) => error({ code: 2 });
  assert.equal(await p.requestInstalledLocation(), "unknown");
  delete nav.geolocation;
  delete globalThis.window.PushManager;
  const state = await p.readInstalledPermissions();
  assert.equal(state.location, "unsupported");
  assert.equal(state.notifications, "unsupported");
  assert.equal(p.needsInstalledPermissions(state), true);
});

test("iPhone standalone mode is detected even when the display-mode media query is unavailable", async () => {
  const { nav } = browser({ installed: false });
  nav.standalone = true;
  delete globalThis.window.matchMedia;
  const p = await permissions();
  assert.equal((await p.readInstalledPermissions()).installed, true);
});

test("continue-for-now dismisses only this app session and never marks permissions as granted", async () => {
  browser({ notification: "denied", location: "denied" });
  const session = new Map();
  globalThis.window.sessionStorage = {
    getItem: (key) => session.get(key) ?? null,
    setItem: (key, value) => session.set(key, value),
  };
  const p = await permissions();
  p.dismissPermissionPrompt("cliente");
  assert.equal(p.permissionPromptDismissed("cliente"), true);
  assert.equal(p.permissionPromptDismissed("entregador"), false);
  const state = await p.readInstalledPermissions();
  assert.equal(state.notifications, "denied");
  assert.equal(state.location, "denied");
  session.clear();
  assert.equal(p.permissionPromptDismissed("cliente"), false);
});

test("continue-for-now still works when session storage can be read but refuses writes", async () => {
  browser();
  globalThis.window.sessionStorage = {
    getItem: () => null,
    setItem: () => {
      throw Error("blocked");
    },
  };
  const p = await permissions();
  p.dismissPermissionPrompt("estabelecimento");
  assert.equal(p.permissionPromptDismissed("estabelecimento"), true);
});

test("a dismissed GPS request ignores a late native success", async () => {
  const { nav, values } = browser({ enabled: false });
  let success;
  nav.geolocation.getCurrentPosition = (ok) => {
    success = ok;
  };
  const p = await permissions();
  const controller = new AbortController();
  const pending = p.requestInstalledLocation(controller.signal);
  controller.abort();
  success({ coords: { latitude: 1, longitude: 2 } });
  assert.equal(await pending, "unknown");
  assert.equal(values.get("wifome:location-enabled"), "0");
});

test("turning location off while native GPS is pending wins over a late success", async () => {
  const { nav, values } = browser();
  let success;
  nav.geolocation.getCurrentPosition = (ok) => {
    success = ok;
  };
  const p = await permissions();
  const { updateDevicePreference } = await import("../src/lib/device-preferences.ts");
  const pending = p.requestInstalledLocation();
  updateDevicePreference("localizacao", false);
  success({ coords: { latitude: 1, longitude: 2 } });
  assert.equal(await pending, "unknown");
  assert.equal(values.get("wifome:location-enabled"), "0");
});

test("allowing notifications in OS settings keeps explicit activation available without app opt-in", async () => {
  browser({ notification: "granted", location: "granted" });
  const p = await permissions();
  assert.equal(p.needsInstalledPermissions(await p.readInstalledPermissions()), true);
});
