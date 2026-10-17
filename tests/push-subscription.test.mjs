import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
afterEach(() => {
  delete globalThis.window;
  delete globalThis.Notification;
  if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
  else delete globalThis.navigator;
});

function browser({ permission = "granted", existing = true } = {}) {
  const calls = { subscribed: 0, registered: 0, saved: [] };
  const values = new Map();
  const subscription = {
    endpoint: "https://push.example.invalid/subscription",
    getKey: (name) => new Uint8Array(name === "auth" ? [4, 5, 6] : [1, 2, 3]).buffer,
  };
  const registration = {
    pushManager: {
      getSubscription: async () => (existing ? subscription : null),
      subscribe: async (options) => {
        assert.equal(options.userVisibleOnly, true);
        assert.ok(options.applicationServerKey instanceof Uint8Array);
        calls.subscribed++;
        return subscription;
      },
    },
  };
  globalThis.Notification = {
    permission,
    requestPermission: () => assert.fail("Automatic push sync must never request permission"),
  };
  globalThis.window = Object.assign(new EventTarget(), {
    PushManager: class {},
    Notification: globalThis.Notification,
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      userAgent: "test device",
      serviceWorker: {
        getRegistration: async (url) => {
          assert.equal(url, "/push-sw.js");
          return existing ? registration : undefined;
        },
        register: async (url, options) => {
          assert.equal(url, "/push-sw.js");
          assert.deepEqual(options, { scope: "/" });
          calls.registered++;
          return registration;
        },
        ready: Promise.resolve(registration),
      },
    },
  });
  return calls;
}

async function implementation() {
  const module = await import("../src/lib/push-subscription.ts").catch((error) => {
    if (error.code === "ERR_MODULE_NOT_FOUND") return null;
    throw error;
  });
  assert.ok(module, "Granted notifications must connect to the signed-in account");
  return module;
}

test("automatic push sync never requests permission or saves a subscription before login", async () => {
  const calls = browser();
  const module = await implementation();
  assert.equal(
    await module.syncGrantedPushSubscription(null, async (data) => calls.saved.push(data)),
    false,
  );
  globalThis.Notification.permission = "denied";
  assert.equal(
    await module.syncGrantedPushSubscription("user-id", async (data) => calls.saved.push(data)),
    false,
  );
  assert.deepEqual(calls, { subscribed: 0, registered: 0, saved: [] });
});

test("an existing device subscription is attached to the authenticated account without another prompt", async () => {
  const calls = browser();
  const module = await implementation();
  assert.equal(
    await module.syncGrantedPushSubscription("user-id", async (data) => calls.saved.push(data)),
    true,
  );
  assert.deepEqual(calls.saved, [
    {
      endpoint: "https://push.example.invalid/subscription",
      p256dh: "AQID",
      auth: "BAUG",
      userAgent: "test device",
    },
  ]);
  assert.equal(calls.subscribed, 0);
});

test("a newly authorized app registers its own worker and subscription; a backend failure remains retryable", async () => {
  const calls = browser({ existing: false });
  const module = await implementation();
  assert.equal(
    await module.syncGrantedPushSubscription("user-id", async (data) => calls.saved.push(data)),
    false,
  );
  assert.equal(
    calls.subscribed,
    0,
    "An absent subscription must not be recreated without explicit opt-in",
  );
  assert.equal(typeof module.setDevicePushEnabled, "function");
  module.setDevicePushEnabled(true);
  await assert.rejects(
    module.syncGrantedPushSubscription("user-id", async () => {
      throw Error("offline");
    }),
    /offline/,
  );
  assert.equal(calls.registered, 1);
  assert.equal(calls.subscribed, 1);
  assert.equal(
    await module.syncGrantedPushSubscription("user-id", async (data) => calls.saved.push(data)),
    true,
  );
  assert.equal(calls.saved.length, 1);
});

test("switching off app alerts prevents automatic reactivation even while the OS permission is granted", async () => {
  const calls = browser();
  const module = await implementation();
  assert.equal(typeof module.setDevicePushEnabled, "function");
  module.setDevicePushEnabled(false);
  assert.equal(
    await module.syncGrantedPushSubscription("user-id", async (data) => calls.saved.push(data)),
    false,
  );
  assert.equal(calls.saved.length, 0);
});

test("opting out during a pending registration prevents a late subscription save", async () => {
  const calls = browser();
  const module = await implementation();
  module.setDevicePushEnabled(true);
  const registration = await globalThis.navigator.serviceWorker.getRegistration("/push-sw.js");
  let finish;
  globalThis.navigator.serviceWorker.getRegistration = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = module.syncGrantedPushSubscription("user-id", async (data) =>
    calls.saved.push(data),
  );
  module.setDevicePushEnabled(false);
  finish(registration);
  assert.equal(await pending, false);
  assert.equal(calls.saved.length, 0);
});
