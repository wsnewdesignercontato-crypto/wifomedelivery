import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const calls = [];
let status = { enabled: true, apiKey: "never-return-this", requestedEnabled: true };
globalThis.__catalogStatusRpc = async (name) => {
  calls.push(name);
  if (status instanceof Error) throw status;
  return status;
};
const hooks = registerHooks({
  resolve(name, context, next) {
    const source =
      name === "@tanstack/react-start"
        ? "export const createServerFn=()=>({handler:fn=>fn});"
        : name.endsWith("/asaas-payment-store.server") || name === "./asaas-payment-store.server"
          ? "export const paymentRpc=(...args)=>globalThis.__catalogStatusRpc(...args);"
          : null;
    return source
      ? { url: "data:text/javascript," + encodeURIComponent(source), shortCircuit: true }
      : next(name, context);
  },
});
const { getCatalogOnlineAvailability } = await import("../src/lib/customer-catalog.functions.ts");
test.after(() => {
  hooks.deregister();
  delete globalThis.__catalogStatusRpc;
});
test("public catalog availability returns only the verified boolean via the internal status RPC", async () => {
  assert.equal(await getCatalogOnlineAvailability(), true);
  assert.deepEqual(calls, ["asaas_online_status"]);
  status = { enabled: false, requestedEnabled: true, apiKey: "never-return-this" };
  assert.equal(await getCatalogOnlineAvailability(), false);
  status = { enabled: "true" };
  assert.equal(await getCatalogOnlineAvailability(), false);
  status = new Error("private provider configuration");
  assert.equal(await getCatalogOnlineAvailability(), false);
});
