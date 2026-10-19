import test, { after } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
let fixture;
globalThis.__ringtoneFixture = () => fixture;
const hook = registerHooks({
  resolve(name, context, next) {
    if (name === "@/lib/device-preferences")
      return {
        url:
          "data:text/javascript," +
          encodeURIComponent(`
 const state=()=>globalThis.__ringtoneFixture();
 export const readDevicePreferences=()=>state().prefs;
 export const subscribeDevicePreferences=fn=>{state().listeners.add(fn);return ()=>state().listeners.delete(fn)};
 export const vibrateDevice=()=>{};
 `),
        shortCircuit: true,
      };
    return next(name, context);
  },
});
let serial = 0;
async function setup() {
  fixture = {
    prefs: { som: true, vibracao: true },
    listeners: new Set(),
    contexts: [],
    nodes: [],
    allow: false,
    timers: new Map(),
    nextTimer: 0,
  };
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    interval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  };
  class Context {
    constructor() {
      this.state = "suspended";
      this.currentTime = 0;
      this.destination = {};
      fixture.contexts.push(this);
    }
    resume() {
      if (!fixture.allow) return Promise.reject(Error("autoplay blocked"));
      this.state = "running";
      return Promise.resolve();
    }
    createOscillator() {
      const node = {
        frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} },
        connect() {
          return this;
        },
        start() {},
        stop() {
          this.stopped = true;
        },
        disconnect() {
          this.disconnected = true;
        },
      };
      fixture.nodes.push(node);
      return node;
    }
    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
          cancelScheduledValues() {},
        },
        connect() {
          return this;
        },
        disconnect() {},
      };
    }
  }
  globalThis.window = Object.assign(new EventTarget(), { AudioContext: Context });
  globalThis.document = new EventTarget();
  globalThis.setInterval = (fn) => {
    const id = ++fixture.nextTimer;
    fixture.timers.set(id, fn);
    return id;
  };
  globalThis.clearInterval = (id) => fixture.timers.delete(id);
  const mod = await import("../src/lib/ride-ringtone.ts?test=" + ++serial);
  return {
    mod,
    cleanup() {
      mod.stopRideRingtone();
      Object.assign(globalThis, {
        window: previous.window,
        document: previous.document,
        setInterval: previous.interval,
        clearInterval: previous.clearInterval,
      });
    },
  };
}
test("blocked audio never queues a backlog and later gestures retry the unlock", async () => {
  const app = await setup();
  try {
    app.mod.startRideRingtone();
    assert.equal(fixture.nodes.length, 0);
    globalThis.window.dispatchEvent(new Event("click"));
    await Promise.resolve();
    assert.equal(fixture.nodes.length, 0);
    fixture.allow = true;
    globalThis.window.dispatchEvent(new Event("click"));
    await Promise.resolve();
    await Promise.resolve();
    assert.ok(fixture.nodes.length > 0);
    assert.equal(fixture.contexts.length, 1);
    app.mod.stopRideRingtone();
    assert.ok(fixture.nodes.every((x) => x.stopped && x.disconnected));
  } finally {
    app.cleanup();
  }
});
test("repeated start is idempotent; preview never cuts off an active order alert", async () => {
  const app = await setup();
  try {
    fixture.allow = true;
    app.mod.startRideRingtone();
    app.mod.startRideRingtone();
    assert.equal(fixture.timers.size, 1);
    const count = fixture.nodes.length;
    assert.equal(await app.mod.previewRideRingtone(), "playing");
    assert.equal(fixture.nodes.length, count);
    assert.equal(fixture.timers.size, 1);
    app.mod.stopRideRingtone();
    assert.equal(fixture.timers.size, 0);
  } finally {
    app.cleanup();
  }
});
test("muted preference is respected and an interrupted context resumes on a later gesture", async () => {
  const app = await setup();
  try {
    fixture.prefs.som = false;
    assert.equal(await app.mod.previewRideRingtone(), "muted");
    assert.equal(fixture.contexts.length, 0);
    fixture.prefs.som = true;
    fixture.allow = true;
    app.mod.startRideRingtone();
    fixture.contexts[0].state = "interrupted";
    globalThis.window.dispatchEvent(new Event("pointerdown"));
    await Promise.resolve();
    assert.equal(fixture.contexts[0].state, "running");
    fixture.prefs.som = false;
    fixture.listeners.forEach((fn) => fn());
    assert.ok(fixture.nodes.every((x) => x.stopped));
  } finally {
    app.cleanup();
  }
});
after(() => hook.deregister());
