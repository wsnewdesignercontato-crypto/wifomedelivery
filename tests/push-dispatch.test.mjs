import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { notificationErrorMessage } from "../src/lib/notification-errors.ts";

let rows, subscriptions, statuses, sends, failSubscriptions;
const client = {
  from(table) {
    const filters = [];
    let update,
      returning = false;
    const query = {
      select() {
        returning = true;
        return query;
      },
      update(value) {
        update = value;
        return query;
      },
      delete() {
        update = "delete";
        return query;
      },
      is(k, v) {
        filters.push((r) => (r[k] ?? null) === v);
        return query;
      },
      not(k, _op, v) {
        filters.push((r) => r[k] !== v);
        return query;
      },
      in(k, v) {
        filters.push((r) => v.includes(r[k]));
        return query;
      },
      eq(k, v) {
        filters.push((r) => r[k] === v);
        return query;
      },
      gte() {
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      then(resolve, reject) {
        try {
          if (table === "push_subscriptions" && failSubscriptions)
            return Promise.resolve({ error: { message: "database unavailable" } }).then(
              resolve,
              reject,
            );
          let values = (table === "notifications" ? rows : subscriptions).filter((r) =>
            filters.every((f) => f(r)),
          );
          if (update === "delete") subscriptions = subscriptions.filter((r) => !values.includes(r));
          else if (update) values.forEach((r) => Object.assign(r, update));
          return Promise.resolve({
            data: values.map((r) => ({ ...r })),
            count: values.length,
            error: null,
          }).then(resolve, reject);
        } catch (e) {
          return Promise.reject(e).then(resolve, reject);
        }
      },
    };
    return query;
  },
};
globalThis.__pushTestClient = client;
globalThis.__pushTestSend = async (target) => {
  sends.push(target.endpoint);
  const status = statuses[target.endpoint] ?? 201;
  if (status instanceof Error) throw status;
  return status;
};
const hooks = registerHooks({
  resolve(name, context, next) {
    const mocked =
      name === "@/integrations/supabase/client.server"
        ? "export const supabaseAdmin=globalThis.__pushTestClient;"
        : name === "@/lib/web-push.server"
          ? "export const sendWebPush=(...args)=>globalThis.__pushTestSend(...args);"
          : null;
    if (mocked)
      return { url: "data:text/javascript," + encodeURIComponent(mocked), shortCircuit: true };
    return next(name, context);
  },
});
const { flushPendingPushNotifications } = await import("../src/lib/push-dispatch.server.ts");
hooks.deregister();
function fixture() {
  rows = [
    {
      id: "n1",
      user_id: "u1",
      titulo: "Novo pedido",
      mensagem: "Atenda",
      link_url: "/estabelecimento/pedidos",
      pushed_at: null,
    },
  ];
  subscriptions = [{ id: "s1", user_id: "u1", endpoint: "device1", p256dh: "key", auth: "auth" }];
  statuses = {};
  sends = [];
  failSubscriptions = false;
}
test("PostgREST plain-object messages reach the UI instead of generic failure", () => {
  assert.equal(
    notificationErrorMessage({ message: "permission denied for table notifications" }),
    "permission denied for table notifications",
  );
  assert.equal(notificationErrorMessage(null), "Não foi possível enviar agora. Tente novamente.");
});
test("concurrent webhook and retry worker claim each pending notification once", async () => {
  fixture();
  await Promise.all([flushPendingPushNotifications(), flushPendingPushNotifications()]);
  assert.deepEqual(sends, ["device1"]);
  assert.ok(rows[0].pushed_at);
});
test("transient push failure remains pending and is delivered on the next retry", async () => {
  fixture();
  statuses.device1 = 503;
  assert.equal((await flushPendingPushNotifications()).sent, 0);
  assert.equal(rows[0].pushed_at, null);
  statuses.device1 = 201;
  assert.equal((await flushPendingPushNotifications()).sent, 1);
  assert.ok(rows[0].pushed_at);
});
test("expired device is removed; successful device is not repeatedly alerted", async () => {
  fixture();
  subscriptions.push({ id: "s2", user_id: "u1", endpoint: "device2" });
  statuses.device1 = 410;
  assert.equal((await flushPendingPushNotifications()).sent, 1);
  assert.deepEqual(
    subscriptions.map((s) => s.id),
    ["s2"],
  );
  assert.equal((await flushPendingPushNotifications()).sent, 0);
});
test("subscription lookup errors release claims instead of losing notifications", async () => {
  fixture();
  failSubscriptions = true;
  await assert.rejects(
    flushPendingPushNotifications(),
    (e) => e.message === "database unavailable",
  );
  assert.equal(rows[0].pushed_at, null);
});
