import test from "node:test";
import assert from "node:assert/strict";
import { nativeAppProfile } from "../src/lib/native-profile.ts";
import { APP_PROFILES } from "../src/lib/app-profiles.ts";
test("packaged app hint only hides installation for its own role and origin", () => {
  for (const [profile, app] of Object.entries(APP_PROFILES)) {
    const ua = "Mozilla/5.0 Android PedeTremNative/" + profile;
    assert.equal(nativeAppProfile(ua, app.origin), profile);
    assert.equal(nativeAppProfile(ua, "https://other.example"), null);
    for (const other of Object.values(APP_PROFILES).filter((value) => value !== app))
      assert.equal(nativeAppProfile(ua, other.origin), null);
  }
  for (const ua of ["Mozilla/5.0", "PedeTremNative/cliente-evil", "PedeTremNative/admin"])
    assert.equal(nativeAppProfile(ua, APP_PROFILES.cliente.origin), null);
});
