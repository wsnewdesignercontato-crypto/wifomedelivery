import test from "node:test";
import assert from "node:assert/strict";
import { resolveAppUrl } from "../src/lib/app-url.ts";

test("explicit application URL is normalized and takes priority", () => {
  assert.equal(
    resolveAppUrl({ appUrl: "https://pedetrem.example/", vercelUrl: "preview.vercel.app" }),
    "https://pedetrem.example",
  );
});

test("Vercel deployment hostname becomes an HTTPS origin", () => {
  assert.equal(
    resolveAppUrl({ vercelUrl: "wifomedelivery-abc.vercel.app" }),
    "https://wifomedelivery-abc.vercel.app",
  );
});

test("local development works without deployment configuration", () => {
  assert.equal(resolveAppUrl({}), "http://localhost:3000");
  assert.equal(resolveAppUrl({ appUrl: "http://localhost:3000/" }), "http://localhost:3000");
});

for (const appUrl of [
  "not-a-url",
  "javascript:alert(1)",
  "ftp://example.com",
  "https://user:secret@example.com",
  "https://example.com/?secret=value",
  "https://example.com/#secret",
]) {
  test(
    "unsafe explicit origin is rejected without revealing input: " + appUrl.split(":")[0],
    () => {
      assert.throws(
        () => resolveAppUrl({ appUrl, vercelUrl: "preview.vercel.app" }),
        (error) => {
          assert.match(error.message, /URL do aplicativo inválida/);
          assert.ok(!error.message.includes(appUrl));
          assert.ok(!error.message.includes("secret"));
          return true;
        },
      );
    },
  );
}

test("Vercel URL accepts only a hostname", () => {
  for (const vercelUrl of [
    "https://preview.vercel.app",
    "user:secret@preview.vercel.app",
    "preview.vercel.app/path",
  ]) {
    assert.throws(() => resolveAppUrl({ vercelUrl }), /URL do aplicativo inválida/);
  }
});
