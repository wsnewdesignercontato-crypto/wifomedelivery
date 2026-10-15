import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// Minimum fixed versions from GHSA-qx66-fv34-fjm8 / CVE-2026-102989.
const require = createRequire(import.meta.url);
const startPackagePath = require.resolve("@tanstack/react-start/package.json");
const startRequire = createRequire(startPackagePath);
for (const [name, minimum] of [
  ["@tanstack/react-start", [1, 168, 60]],
  ["@tanstack/start-server-core", [1, 169, 39]],
]) {
  test(`${name} resolves to a version patched for CVE-2026-102989`, () => {
    const pkg = JSON.parse(readFileSync(startRequire.resolve(`${name}/package.json`), "utf8"));
    assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
    const version = pkg.version.split(".").map(Number);
    const firstDifference = version.findIndex((value, index) => value !== minimum[index]);
    assert.ok(
      firstDifference === -1 || version[firstDifference] > minimum[firstDifference],
      `${name}@${pkg.version} must be upgraded to ${minimum.join(".")} or later.`,
    );
  });
}
