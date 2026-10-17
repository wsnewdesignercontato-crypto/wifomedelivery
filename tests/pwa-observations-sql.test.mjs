import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createAppInstallDatabase } from "../scripts/testing/app-install-database.mjs";

const alice = "10000000-0000-4000-8000-000000000001";
const bob = "10000000-0000-4000-8000-000000000002";
const device = "20000000-0000-4000-8000-000000000001";
const second = "20000000-0000-4000-8000-000000000002";
const third = "20000000-0000-4000-8000-000000000003";

test("public observation storage remains private and metrics deduplicate devices and count accounts separately", async (t) => {
  const db = await createAppInstallDatabase();
  await db.exec("CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO service_role");
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261017140535_observe_pwa_installs_and_admin_metrics.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const service = () => db.exec("RESET ROLE; SET ROLE service_role");
  const observe = (app, id, evidence, installed) =>
    db.query("SELECT public.observe_pwa_install($1, $2::uuid, $3, $4)", [
      app,
      id,
      evidence,
      installed,
    ]);
  const metrics = async () =>
    (await db.query("SELECT public.admin_pwa_install_metrics() AS result")).rows[0].result;
  const legacy = async (user, id, installed) => {
    await db.exec(
      `RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${user}', false)`,
    );
    await db.query("SELECT public.record_app_install('cliente', $1::uuid, $2, $3)", [
      id,
      installed ? "appinstalled" : "browser-query",
      installed,
    ]);
  };
  try {
    await service();
    await t.test(
      "all three profiles start at real zero and false observations do not create visitors",
      async () => {
        await observe("cliente", device, "browser-query", false);
        assert.equal(
          (await db.query("SELECT * FROM public.pwa_install_observations")).rows.length,
          0,
        );
        const result = await metrics();
        assert.equal(result.apps.length, 3);
        assert.ok(result.updatedAt);
        for (const app of result.apps) {
          assert.equal(app.activeInstalls, 0);
          assert.equal(app.historicalInstalls, 0);
          assert.equal(app.identifiedAccounts, 0);
          assert.equal(app.lastObservedAt, null);
        }
      },
    );
    await t.test(
      "retries and transitions preserve first confirmation and standalone open time",
      async () => {
        await observe("cliente", third, "appinstalled", true);
        const first = (await db.query("SELECT * FROM public.pwa_install_observations")).rows[0];
        assert.ok(first.first_installed_at instanceof Date);
        assert.equal(first.last_opened_at, null);
        await observe("cliente", third, "standalone", true);
        const opened = (await db.query("SELECT * FROM public.pwa_install_observations")).rows[0];
        assert.equal(+opened.first_installed_at, +first.first_installed_at);
        assert.ok(opened.last_opened_at instanceof Date);
        await observe("cliente", third, "browser-query", false);
        await observe("cliente", third, "appinstalled", true);
        const repeated = (await db.query("SELECT * FROM public.pwa_install_observations")).rows[0];
        assert.equal(+repeated.first_installed_at, +first.first_installed_at);
        assert.equal(+repeated.last_opened_at, +opened.last_opened_at);
        assert.ok(+repeated.last_observed_at >= +opened.last_observed_at);
        assert.equal(
          (await metrics()).apps.find((app) => app.appType === "cliente").historicalInstalls,
          1,
        );
      },
    );
    await t.test(
      "legacy accounts on the same device and new observations are merged exactly once",
      async () => {
        await legacy(alice, device, true);
        await legacy(bob, device, true);
        await legacy(alice, second, true);
        await service();
        await observe("cliente", device, "standalone", true);
        await observe("entrega", device, "standalone", true);
        let result = await metrics();
        const client = result.apps.find((app) => app.appType === "cliente");
        assert.equal(client.activeInstalls, 3);
        assert.equal(client.historicalInstalls, 3);
        assert.equal(client.identifiedAccounts, 2);
        assert.equal(result.apps.find((app) => app.appType === "entrega").activeInstalls, 1);
        assert.equal(result.apps.find((app) => app.appType === "entrega").identifiedAccounts, 0);
        // Current observation supersedes stale authenticated records of this device.
        await observe("cliente", device, "browser-query", false);
        result = await metrics();
        assert.equal(result.apps.find((app) => app.appType === "cliente").activeInstalls, 2);
        assert.equal(result.apps.find((app) => app.appType === "cliente").historicalInstalls, 3);
        assert.equal(result.apps.find((app) => app.appType === "cliente").identifiedAccounts, 2);
        // Merely visiting while signed in must not count as an identified installation.
        await legacy(bob, "20000000-0000-4000-8000-000000000004", false);
        await service();
        assert.equal(
          (await metrics()).apps.find((app) => app.appType === "cliente").historicalInstalls,
          3,
        );
      },
    );
    await t.test("invalid evidence is rejected even for the trusted writer", async () => {
      await assert.rejects(observe("cliente", third, "standalone", false), /evidence/i);
      await assert.rejects(observe("admin", third, "standalone", true), /app.type/i);
      await assert.rejects(observe("cliente", third, "click", true), /evidence/i);
      await assert.rejects(observe("cliente", null, "standalone", true), /installation/i);
    });
    await t.test(
      "the first negative public observation can deactivate a historically confirmed legacy installation",
      async () => {
        const legacyOnly = "20000000-0000-4000-8000-000000000005";
        await legacy(alice, legacyOnly, true);
        await service();
        assert.equal(
          (await metrics()).apps.find((app) => app.appType === "cliente").activeInstalls,
          3,
        );
        const before = (
          await db.query(
            "SELECT installed_at FROM public.user_app_installs WHERE installation_id = $1",
            [legacyOnly],
          )
        ).rows[0];
        await observe("cliente", legacyOnly, "browser-query", false);
        const current = (await metrics()).apps.find((app) => app.appType === "cliente");
        assert.equal(current.activeInstalls, 2);
        assert.equal(current.historicalInstalls, 4);
        const observation = (
          await db.query(
            "SELECT * FROM public.pwa_install_observations WHERE installation_id = $1",
            [legacyOnly],
          )
        ).rows[0];
        assert.equal(+observation.first_installed_at, +before.installed_at);
        assert.equal(observation.installed, false);
        // A signed-in visit with no prior positive confirmation still creates no telemetry row.
        const onlyVisit = "20000000-0000-4000-8000-000000000006";
        await legacy(alice, onlyVisit, false);
        await service();
        await observe("cliente", onlyVisit, "browser-query", false);
        assert.equal(
          (
            await db.query(
              "SELECT * FROM public.pwa_install_observations WHERE installation_id = $1",
              [onlyVisit],
            )
          ).rows.length,
          0,
        );
      },
    );
    await t.test(
      "anon and authenticated cannot inspect storage or call either privileged RPC",
      async () => {
        for (const role of ["anon", "authenticated"]) {
          await db.exec(`RESET ROLE; SET ROLE ${role}`);
          await assert.rejects(
            db.query("SELECT * FROM public.pwa_install_observations"),
            /permission denied/i,
          );
          await assert.rejects(observe("cliente", third, "standalone", true), /permission denied/i);
          await assert.rejects(metrics(), /permission denied/i);
          await assert.rejects(
            db.query(
              "INSERT INTO public.pwa_install_observations (app_type,installation_id,installed,evidence) VALUES ('cliente',$1,true,'standalone')",
              [third],
            ),
            /permission denied/i,
          );
        }
      },
    );
  } finally {
    await db.close();
  }
});
