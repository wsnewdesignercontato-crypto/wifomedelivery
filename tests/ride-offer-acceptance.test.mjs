import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

// Execute the real event handler without mounting map/GPS/ringtone components.
const source = await readFile(
  new URL("../src/components/entregador/new-ride-offer.tsx", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile(
  "offer.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let handler;
function find(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "aceitar") handler = node.getText(ast);
  ts.forEachChild(node, find);
}
find(ast);
assert.ok(handler, "Offer acceptance handler must exist");
const javascript = ts.transpile(handler, { target: ts.ScriptTarget.ES2022 });

function acceptance(transition) {
  const events = [];
  const legacyResponse = { data: { id: "delivery" }, error: null };
  const legacyQuery = {
    ...legacyResponse,
    update() {
      return this;
    },
    eq() {
      return this;
    },
    select() {
      return this;
    },
    maybeSingle: async () => legacyResponse,
  };
  const run = vm.runInNewContext(`${javascript}; aceitar;`, {
    offer: { deliveryId: "delivery", orderId: "order" },
    courier: { user_id: "courier" },
    accepting: false,
    canCourierAccessRides: () => true,
    stopRideRingtone: () => events.push("stop"),
    setAccepting: (value) => events.push(["accepting", value]),
    setOffer: (value) => events.push(["offer", value]),
    toast: { success: () => events.push("success"), error: () => events.push("error") },
    navigate: () => events.push("navigate"),
    transitionCourierDelivery: async (...args) => {
      events.push(["transition", ...args]);
      await transition();
    },
    // Legacy implementation succeeded despite an order-write error. Keep that
    // boundary reproducible so removing the transactional call fails this test.
    supabase: {
      from: (table) =>
        table === "orders"
          ? { update: () => ({ eq: async () => ({ error: Error("order rejected") }) }) }
          : legacyQuery,
    },
  });
  return { run, events };
}

test("ride offer keeps acceptance pending until the atomic command succeeds, then navigates", async () => {
  let resolve;
  const pending = new Promise((done) => {
    resolve = done;
  });
  const { run, events } = acceptance(() => pending);
  const done = run();
  assert.deepEqual(events, ["stop", ["accepting", true], ["transition", "delivery", "accepted"]]);
  resolve();
  await done;
  assert.deepEqual(events.slice(3), [["accepting", false], "success", ["offer", null], "navigate"]);
});

test("ride offer reports failed atomic acceptance without success or navigation", async () => {
  const { run, events } = acceptance(async () => {
    throw Error("order rejected");
  });
  await run();
  assert.ok(events.includes("error"));
  assert.ok(!events.includes("success"));
  assert.ok(!events.includes("navigate"));
  assert.ok(
    events.some((event) => Array.isArray(event) && event[0] === "accepting" && event[1] === false),
  );
});
