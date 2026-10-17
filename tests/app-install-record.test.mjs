import test from "node:test";
import assert from "node:assert/strict";
import { appInstallRecordSchema } from "../src/lib/app-install-record.ts";

const input = {
  appType: "cliente",
  installationId: "20000000-0000-4000-8000-000000000001",
  evidence: "standalone",
  installed: true,
};

test("installation validator accepts observed evidence and rejects spoofed identity/dates", () => {
  for (const appType of ["cliente", "estabelecimento", "entrega"]) {
    assert.equal(appInstallRecordSchema.parse({ ...input, appType }).appType, appType);
  }
  for (const evidence of ["standalone", "appinstalled"]) {
    assert.equal(
      appInstallRecordSchema.safeParse({ ...input, evidence, installed: false }).success,
      false,
    );
  }
  assert.equal(
    appInstallRecordSchema.safeParse({ ...input, evidence: "browser-query", installed: false })
      .success,
    true,
  );
  for (const addition of [
    { user_id: input.installationId },
    { installed_at: "2000-01-01" },
    { last_opened_at: "2000-01-01" },
  ]) {
    assert.equal(appInstallRecordSchema.safeParse({ ...input, ...addition }).success, false);
  }
  assert.equal(
    appInstallRecordSchema.safeParse({ ...input, installationId: "invalid" }).success,
    false,
  );
  assert.equal(appInstallRecordSchema.safeParse({ ...input, appType: "admin" }).success, false);
});
