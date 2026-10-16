import test from "node:test";
import assert from "node:assert/strict";
import { pendingAttempt } from "../src/lib/pending-attempt.ts";

test("uncertain withdrawal retries reuse the same key, including after reload", () => {
  const records = new Map();
  const storage = {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
  };
  const first = pendingAttempt(storage, "merchant-1", "5000");
  assert.equal(pendingAttempt(storage, "merchant-1", "5000").key, first.key);
  assert.notEqual(pendingAttempt(storage, "merchant-1", "6000", first).key, first.key);
  assert.notEqual(pendingAttempt(storage, "merchant-2", "5000").key, first.key);
});
test("blocked storage retains memory retries and invalid keys are ignored", () => {
  const storage = {
    getItem: () => '{"fingerprint":"5000","key":"not-a-uuid"}',
    setItem: () => {
      throw Error("blocked");
    },
  };
  const first = pendingAttempt(storage, "wallet", "5000");
  assert.equal(pendingAttempt(storage, "wallet", "5000", first).key, first.key);
});
