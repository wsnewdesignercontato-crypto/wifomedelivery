import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

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

// Check every copy, including nested build tooling that runtime resolution misses.
// Fixed release lines verified against the npm security advisory endpoint (A17).
const securityMinimums = new Map([
  ["@babel/core", { 7: "7.29.6" }],
  ["baseline-browser-mapping", { 2: "2.11.0" }],
  ["brace-expansion", { 1: "1.1.21", 5: "5.0.12" }],
  ["browserslist", { 4: "4.28.7" }],
  ["js-yaml", { 4: "4.3.2" }],
  ["nanoid", { 3: "3.3.18" }],
  ["postcss", { 8: "8.5.23" }],
  ["seroval", { 1: "1.6.3" }],
  ["source-map-js", { 1: "1.2.2" }],
]);
const lock = ts.parseConfigFileTextToJson(
  "bun.lock",
  readFileSync(new URL("../bun.lock", import.meta.url), "utf8"),
);
assert.equal(lock.error, undefined, "bun.lock must parse before checking resolved versions");

for (const [name, minimums] of securityMinimums) {
  test(`all locked copies of ${name} meet the A17 security floor`, () => {
    const copies = Object.entries(lock.config.packages).filter(([, entry]) =>
      entry[0].startsWith(`${name}@`),
    );
    assert.ok(copies.length > 0, `${name} must remain covered by this check`);
    for (const [location, entry] of copies) {
      const version = entry[0].slice(name.length + 1);
      assert.match(version, /^\d+\.\d+\.\d+$/);
      const parts = version.split(".").map(Number);
      const minimum = minimums[parts[0]];
      assert.ok(minimum, `${location}: review security coverage before changing major version`);
      const floor = minimum.split(".").map(Number);
      const difference = parts.findIndex((part, index) => part !== floor[index]);
      assert.ok(
        difference === -1 || parts[difference] > floor[difference],
        `${location} resolves ${version}; the patched ${parts[0]}.x floor is ${minimum}`,
      );
    }
  });
}
