import test from "node:test";
import assert from "node:assert/strict";
import { APP_PROFILES, profileInstallUrl } from "../src/lib/app-profiles.ts";
import { androidNeedsChrome, chromeInstallUrl } from "../src/lib/android-install.ts";

test("Chrome handoff preserves each independent app and has a same-profile HTTPS fallback", () => {
  const targets = new Set();
  for (const profile of Object.keys(APP_PROFILES)) {
    const target = profileInstallUrl(profile);
    const url = new URL(target);
    const intent = chromeInstallUrl(profile);
    assert.ok(intent.startsWith(`intent://${url.host}${url.pathname}#Intent;`));
    assert.ok(intent.includes("scheme=https;package=com.android.chrome;"));
    const encodedFallback = intent.match(/S\.browser_fallback_url=([^;]+);end$/)?.[1];
    assert.equal(decodeURIComponent(encodedFallback), target);
    assert.equal(new URL(decodeURIComponent(encodedFallback)).origin, APP_PROFILES[profile].origin);
    targets.add(intent);
  }
  assert.equal(targets.size, 3);
});

test("Android app windows and embedded browsers hand off while native-ready tabs install directly", () => {
  const chrome = {
    userAgent: "Mozilla/5.0 (Linux; Android 15) Chrome/155.0",
    standalone: false,
    supportsPrompt: true,
    nativeReady: false,
  };
  assert.equal(androidNeedsChrome(chrome), false);
  assert.equal(androidNeedsChrome({ ...chrome, standalone: true }), true);
  assert.equal(androidNeedsChrome({ ...chrome, supportsPrompt: false }), true);
  assert.equal(androidNeedsChrome({ ...chrome, userAgent: chrome.userAgent + " wv" }), true);
  assert.equal(androidNeedsChrome({ ...chrome, userAgent: chrome.userAgent + " Instagram" }), true);
  assert.equal(androidNeedsChrome({ ...chrome, standalone: true, nativeReady: true }), false);
  assert.equal(
    androidNeedsChrome({ ...chrome, userAgent: "iPhone Safari", supportsPrompt: false }),
    false,
  );
});
