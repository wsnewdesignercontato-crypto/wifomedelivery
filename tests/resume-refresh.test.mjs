import test from "node:test";
import assert from "node:assert/strict";
import { bindResumeRefresh } from "../src/lib/resume-refresh.ts";
test("a matching service-worker push refreshes the authorized page snapshot, with cleanup", () => {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator"),
    oldWindow = globalThis.window,
    oldDocument = globalThis.document;
  const worker = new EventTarget();
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { serviceWorker: worker },
  });
  let calls = 0;
  const stop = bindResumeRefresh(() => calls++);
  const send = (type) => {
    const event = new Event("message");
    Object.defineProperty(event, "data", { value: { type } });
    worker.dispatchEvent(event);
  };
  try {
    send("unrelated");
    assert.equal(calls, 0);
    send("pedetrem:push-received");
    assert.equal(calls, 1);
    stop();
    send("pedetrem:push-received");
    assert.equal(calls, 1);
  } finally {
    stop();
    globalThis.window = oldWindow;
    globalThis.document = oldDocument;
    if (oldNavigator) Object.defineProperty(globalThis, "navigator", oldNavigator);
    else delete globalThis.navigator;
  }
});
