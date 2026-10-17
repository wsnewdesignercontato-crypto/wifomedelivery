import test from "node:test";
import assert from "node:assert/strict";

const module = await import("../src/lib/app-update.ts").catch((error) => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return null;
  throw error;
});

test("a new version is offered immediately against the loaded page and reloads only after the user's action", async () => {
  assert.ok(module, "App updates need a user-controlled flow");
  let remote = "new";
  let reloads = 0;
  const offers = [];
  const monitor = module.createAppUpdateMonitor(
    "loaded",
    async () => remote,
    (version) => offers.push(version),
    () => reloads++,
  );
  await monitor.check();
  await monitor.check();
  assert.deepEqual(offers, ["new"]);
  assert.equal(reloads, 0);
  remote = "newer";
  await monitor.check();
  assert.deepEqual(offers, ["new", "newer"]);
  monitor.apply();
  monitor.apply();
  assert.equal(reloads, 1);
});

test("unchanged, offline, disposed and concurrent checks never trigger a stale update", async () => {
  assert.ok(module);
  let finish;
  let requests = 0;
  const offers = [];
  const monitor = module.createAppUpdateMonitor(
    "loaded",
    () => {
      requests++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    (value) => offers.push(value),
    () => assert.fail("No automatic reload"),
  );
  const pending = monitor.check();
  await monitor.check();
  assert.equal(requests, 1);
  monitor.stop();
  finish("new");
  await pending;
  monitor.apply();
  assert.deepEqual(offers, []);
  for (const read of [
    async () => "loaded",
    async () => null,
    async () => {
      throw Error("offline");
    },
  ]) {
    const current = module.createAppUpdateMonitor(
      "loaded",
      read,
      (value) => offers.push(value),
      () => assert.fail("No update to apply"),
    );
    await current.check();
    current.apply();
  }
  assert.deepEqual(offers, []);
});

test("fingerprints use only the actual same-origin module entry, ignoring app data and third-party scripts", () => {
  assert.ok(module);
  const origin = "https://pedetrem.vercel.app";
  const html = `<script src="https://other.example/assets/third.js" type="module"></script><script type="application/json">{"src":"/assets/data.js"}</script><script type="module" async src="/assets/index-current.js"></script>`;
  assert.equal(module.appVersionFingerprint(html, origin), "/assets/index-current.js");
  assert.equal(module.appVersionFingerprint("<h1>Offline</h1>", origin), null);
});

test("version checks bypass HTTP cache and reject error and non-HTML responses", async () => {
  assert.ok(module);
  const origin = "https://pedetrem-loja.vercel.app";
  const html = `<script type="module" src="/assets/index-new.js"></script>`;
  const version = await module.fetchAppVersion(origin, async (url, options) => {
    assert.equal(new URL(url).origin, origin);
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal);
    return new Response(html, { headers: { "content-type": "text/html" } });
  });
  assert.equal(version, "/assets/index-new.js");
  for (const response of [
    new Response(html, { status: 503 }),
    new Response(html, { headers: { "content-type": "application/json" } }),
  ]) {
    assert.equal(await module.fetchAppVersion(origin, async () => response), null);
  }
});

test("applying before a pending or failed check cannot leave an update action stuck", async () => {
  let finish;
  let reloads = 0;
  const monitor = module.createAppUpdateMonitor(
    "loaded",
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    () => {},
    () => reloads++,
  );
  const checking = monitor.check();
  assert.equal(monitor.apply(), false);
  finish(null);
  await checking;
  assert.equal(monitor.apply(), false);
  assert.equal(reloads, 0);
  const ready = module.createAppUpdateMonitor(
    "loaded",
    async () => "new",
    () => {},
    () => reloads++,
  );
  await ready.check();
  assert.equal(ready.apply(), true);
  assert.equal(ready.apply(), false);
  assert.equal(reloads, 1);
});
