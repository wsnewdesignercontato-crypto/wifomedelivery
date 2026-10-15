import test from "node:test";
import assert from "node:assert/strict";
import { getPublicSupabaseConfig } from "../src/lib/supabase-config.ts";

const url = "https://example.supabase.co";
const publicKey = "sb_publishable_public-test-key";
const legacyKey = (role) =>
  `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ role, iss: "supabase" })).toString("base64url")}.signature`;

test("a publishable key can configure the public client", () => {
  assert.deepEqual(getPublicSupabaseConfig({ url, key: publicKey }), { url, key: publicKey });
});

test("a legacy anon key remains compatible", () => {
  const key = legacyKey("anon");
  assert.equal(getPublicSupabaseConfig({ url, key }).key, key);
});

for (const key of ["sb_secret_do-not-expose", legacyKey("service_role")]) {
  test("a privileged key is rejected without disclosing its value", () => {
    assert.throws(
      () => getPublicSupabaseConfig({ url, key }),
      (error) => error instanceof Error && !error.message.includes(key),
    );
  });
}

test("a missing public key is rejected", () => {
  assert.throws(() => getPublicSupabaseConfig({ url }));
});

test("a missing API URL is rejected", () => {
  assert.throws(() => getPublicSupabaseConfig({ key: publicKey }));
});

test("a malformed legacy key is rejected", () => {
  assert.throws(() => getPublicSupabaseConfig({ url, key: "invalid.payload.signature" }));
});

test("a URL with an unsafe scheme is rejected", () => {
  assert.throws(() => getPublicSupabaseConfig({ url: "javascript:alert(1)", key: publicKey }));
});
