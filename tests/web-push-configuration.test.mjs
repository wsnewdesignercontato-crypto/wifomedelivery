import test from "node:test";
import assert from "node:assert/strict";
import { validateWebPushConfiguration } from "../src/lib/web-push.server.ts";
test("runtime signing health validates a real matching P-256 key without sending push", async () => {
  const old = { public: process.env.VAPID_PUBLIC_KEY, private: process.env.VAPID_PRIVATE_JWK };
  try {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ]);
    process.env.VAPID_PRIVATE_JWK = JSON.stringify(
      await crypto.subtle.exportKey("jwk", pair.privateKey),
    );
    process.env.VAPID_PUBLIC_KEY = Buffer.from(
      await crypto.subtle.exportKey("raw", pair.publicKey),
    ).toString("base64url");
    await validateWebPushConfiguration();
    process.env.VAPID_PUBLIC_KEY = "wrong-key";
    await assert.rejects(validateWebPushConfiguration(), /does not match/);
    delete process.env.VAPID_PRIVATE_JWK;
    await assert.rejects(validateWebPushConfiguration(), /missing/);
  } finally {
    for (const [key, value] of [
      ["VAPID_PUBLIC_KEY", old.public],
      ["VAPID_PRIVATE_JWK", old.private],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
