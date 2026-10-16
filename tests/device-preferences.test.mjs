import test from "node:test";
import assert from "node:assert/strict";

const preferences = await import("../src/lib/device-preferences.ts");
function browser() {
  const data = new Map();
  const target = new EventTarget();
  Object.assign(target, {
    localStorage: {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, value),
    },
  });
  globalThis.window = target;
  return data;
}

test("invalid persisted fields cannot enable disabled preferences or inject extra fields", () => {
  assert.equal(typeof preferences.normalizeDevicePreferences, "function");
  assert.deepEqual(
    preferences.normalizeDevicePreferences({
      som: false,
      vibracao: "false",
      localizacao: 0,
      economia_dados: true,
      extra: true,
    }),
    {
      som: false,
      vibracao: true,
      localizacao: true,
      modo_escuro_auto: true,
      economia_dados: true,
    },
  );
  assert.equal(preferences.normalizeDevicePreferences(null).som, true);
});

test("preference changes preserve auth, synchronize the legacy location flag, and notify subscribers", () => {
  assert.equal(typeof preferences.updateDevicePreference, "function");
  const data = browser();
  data.set("sb-project-auth-token", "session");
  data.set("wifome:location-enabled", "0");
  assert.equal(preferences.isLocationEnabled(), false);
  let changes = 0;
  const stop = preferences.subscribeDevicePreferences(() => changes++);
  preferences.updateDevicePreference("localizacao", true);
  preferences.updateDevicePreference("som", false);
  stop();
  assert.equal(preferences.isLocationEnabled(), true);
  assert.equal(data.get("wifome:location-enabled"), "1");
  assert.equal(data.get("sb-project-auth-token"), "session");
  assert.equal(preferences.readDevicePreferences().som, false);
  assert.equal(changes, 2);
});

test("GPS watches stop immediately on opt-out, suppress late callbacks and resume on opt-in", () => {
  assert.equal(typeof preferences.watchDeviceLocation, "function");
  browser();
  let listener,
    started = 0,
    cleared = 0,
    received = 0;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      geolocation: {
        watchPosition: (success) => {
          listener = success;
          return ++started;
        },
        clearWatch: () => cleared++,
      },
    },
  });
  const stop = preferences.watchDeviceLocation(() => received++);
  listener({ coords: { latitude: 1, longitude: 2 } });
  preferences.updateDevicePreference("localizacao", false);
  listener({ coords: { latitude: 1, longitude: 2 } });
  assert.equal(received, 1);
  assert.equal(cleared, 1);
  preferences.updateDevicePreference("localizacao", true);
  assert.equal(started, 2);
  stop();
  assert.equal(cleared, 2);
});

test("disabled GPS never requests a location and vibration honors its independent preference", () => {
  assert.equal(typeof preferences.getCurrentDevicePosition, "function");
  browser();
  let gps = 0,
    vibration = 0;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      geolocation: { getCurrentPosition: () => gps++ },
      vibrate: () => {
        vibration++;
        return true;
      },
    },
  });
  preferences.updateDevicePreference("localizacao", false);
  preferences.updateDevicePreference("som", false);
  preferences.getCurrentDevicePosition(() => assert.fail("GPS must be disabled"));
  preferences.vibrateDevice(100);
  assert.equal(gps, 0);
  assert.equal(vibration, 1);
  preferences.updateDevicePreference("vibracao", false);
  preferences.vibrateDevice(100);
  assert.equal(vibration, 1);
});

test("clearing cached responses leaves all login and installation storage intact", async () => {
  assert.equal(typeof preferences.clearDeviceCache, "function");
  const data = browser();
  data.set("sb-project-auth-token", "session");
  data.set("ifome-theme", "dark");
  data.set("wifome:app-instalado:cliente", "1");
  const deleted = [];
  await preferences.clearDeviceCache({
    keys: async () => ["wifome-shell", "workbox-precache"],
    delete: async (key) => {
      deleted.push(key);
      return true;
    },
  });
  assert.deepEqual(deleted, ["wifome-shell", "workbox-precache"]);
  assert.equal(data.get("sb-project-auth-token"), "session");
  assert.equal(data.get("ifome-theme"), "dark");
  assert.equal(data.get("wifome:app-instalado:cliente"), "1");
});

test("opting out during a pending GPS request reports an error instead of leaving callers waiting", () => {
  browser();
  let receive,
    errors = 0;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition: (success) => {
          receive = success;
        },
      },
    },
  });
  preferences.getCurrentDevicePosition(
    () => assert.fail("Late coordinates must not be shared"),
    () => errors++,
  );
  preferences.updateDevicePreference("localizacao", false);
  receive({ coords: { latitude: 1, longitude: 2 } });
  assert.equal(errors, 1);
});

test("saved courier device choices migrate without overriding explicit shared preferences", () => {
  const data = browser();
  data.set(
    "wifome_courier_prefs",
    JSON.stringify({ som_corridas: false, vibracao: false, localizacao: false }),
  );
  assert.equal(preferences.readDevicePreferences().som, false);
  assert.equal(preferences.isLocationEnabled(), false);
  data.set("wifome:device-prefs", JSON.stringify({ som: true }));
  assert.equal(preferences.readDevicePreferences().som, true);
  assert.equal(preferences.readDevicePreferences().vibracao, false);
});

test("malformed JSON uses defaults and blocked writes still honor choices for this session", () => {
  const data = browser();
  data.set("wifome:device-prefs", "{broken");
  assert.equal(preferences.readDevicePreferences().som, true);
  window.localStorage.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  preferences.updateDevicePreference("som", false);
  assert.equal(preferences.readDevicePreferences().som, false);
});
