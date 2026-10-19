import test from "node:test";
import assert from "node:assert/strict";
import { applyAccountAction } from "../src/lib/admin-account-actions.server.ts";
const actor = "10000000-0000-4000-8000-000000000001",
  target = "10000000-0000-4000-8000-000000000002";
function fixture({ roles = [], failAuth = false, failAudit = false } = {}) {
  const calls = [];
  const admin = {
    auth: {
      admin: {
        getUserById: async (id) => ({
          data: { user: { id, email: "fixture@example.invalid" } },
          error: null,
        }),
        updateUserById: async (id, patch) => {
          calls.push(["update", id, patch]);
          return { error: failAuth ? new Error("provider failure") : null };
        },
        deleteUser: async (id, soft) => {
          calls.push(["delete", id, soft]);
          return { error: failAuth ? new Error("provider failure") : null };
        },
      },
    },
    from(table) {
      assert.ok(["user_roles", "admin_audit_log"].includes(table), "history must never be deleted");
      return {
        select() {
          return this;
        },
        eq: async () => ({ data: roles.map((role) => ({ role })), error: null }),
        insert: async (value) => {
          calls.push(["audit", value]);
          return { error: failAudit ? new Error("audit unavailable") : null };
        },
      };
    },
  };
  return { admin, calls };
}
const input = (action) => ({
  targetUserId: target,
  action,
  confirmedEmail: "fixture@example.invalid",
});
test("blocking and unblocking use the official Auth API and record both outcomes", async () => {
  for (const [action, duration] of [
    ["block", "876000h"],
    ["unblock", "none"],
  ]) {
    const { admin, calls } = fixture();
    const result = await applyAccountAction(admin, actor, input(action));
    assert.equal(result.ok, true);
    assert.deepEqual(
      calls.filter((x) => x[0] === "update"),
      [["update", target, { ban_duration: duration }]],
    );
    assert.equal(calls.filter((x) => x[0] === "audit").length, 2);
  }
});
test("deletion always uses soft Auth deletion, retaining historical foreign keys", async () => {
  const { admin, calls } = fixture();
  await applyAccountAction(admin, actor, input("delete"));
  assert.deepEqual(
    calls.filter((x) => x[0] === "delete"),
    [["delete", target, true]],
  );
});
test("self actions and administrative accounts are protected before mutation", async () => {
  for (const action of ["block", "delete"]) {
    const { admin, calls } = fixture({ roles: ["admin"] });
    await assert.rejects(applyAccountAction(admin, actor, input(action)), /administrador/);
    assert.equal(calls.length, 0);
  }
  const { admin, calls } = fixture();
  await assert.rejects(applyAccountAction(admin, target, input("delete")), /própria conta/);
  assert.equal(calls.length, 0);
});
test("a mismatched confirmation and invalid IDs never reach Auth mutation", async () => {
  const { admin, calls } = fixture();
  await assert.rejects(
    applyAccountAction(admin, actor, {
      ...input("delete"),
      confirmedEmail: "other@example.invalid",
    }),
    /confirmação/,
  );
  await assert.rejects(
    applyAccountAction(admin, actor, { ...input("delete"), targetUserId: "invalid" }),
  );
  assert.equal(calls.length, 0);
});
test("an audit failure prevents mutation and an Auth failure never records completed", async () => {
  const a = fixture({ failAudit: true });
  await assert.rejects(applyAccountAction(a.admin, actor, input("block")), /Nenhuma conta/);
  assert.ok(!a.calls.some((x) => x[0] === "update"));
  const b = fixture({ failAuth: true });
  await assert.rejects(applyAccountAction(b.admin, actor, input("delete")), /Não foi possível/);
  assert.ok(!b.calls.some((x) => x[0] === "audit" && x[1].action.endsWith("_completed")));
});
