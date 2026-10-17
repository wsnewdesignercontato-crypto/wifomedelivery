import test from "node:test";
import assert from "node:assert/strict";

const { syncPwaInstall } = await import("../src/lib/pwa-install-sync.ts");
const proof = { installed: true, evidence: "appinstalled", observedAt: Date.now() };

test("guest installations are observed without requiring a login", async () => {
  const calls = [];
  await syncPwaInstall("entregador", "device", proof, false, {
    observe: async (input) => calls.push(["observe", input]),
    record: async () => assert.fail("A guest cannot write an authenticated association"),
  });
  assert.deepEqual(calls, [
    [
      "observe",
      {
        appType: "entrega",
        installationId: "device",
        installed: true,
        evidence: "appinstalled",
      },
    ],
  ]);
});

test("authenticated installations observe and associate the same role and device", async () => {
  const calls = [];
  await syncPwaInstall("estabelecimento", "device", proof, true, {
    observe: async (input) => calls.push(["observe", input]),
    record: async (input) => calls.push(["record", input]),
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0][1], calls[1][1]);
  assert.equal(calls[0][1].appType, "estabelecimento");
});

test("an unavailable association never prevents the observation and failures remain retryable", async () => {
  let observed = 0;
  await assert.rejects(
    syncPwaInstall("cliente", "device", proof, true, {
      observe: async () => {
        observed++;
      },
      record: async () => {
        throw new Error("offline");
      },
    }),
    /offline/,
  );
  assert.equal(observed, 1);
});
