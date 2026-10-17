import test from "node:test";
import assert from "node:assert/strict";
import { createAppInstallDatabase } from "../scripts/testing/app-install-database.mjs";

const alice = "10000000-0000-4000-8000-000000000001";
const bob = "10000000-0000-4000-8000-000000000002";
const device = "20000000-0000-4000-8000-000000000001";
const otherDevice = "20000000-0000-4000-8000-000000000002";

test("PWA records enforce device/profile isolation, evidence and server timestamps under RLS", async (t) => {
  const db = await createAppInstallDatabase();
  const signIn = async (user) =>
    db.exec(
      `RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${user}', false)`,
    );
  const record = async (app, id, evidence, installed) =>
    (
      await db.query("SELECT public.record_app_install($1, $2::uuid, $3, $4) AS record", [
        app,
        id,
        evidence,
        installed,
      ])
    ).rows[0].record;
  try {
    await signIn(alice);
    await t.test(
      "first confirmation is retained; only standalone updates last_opened_at",
      async () => {
        const absent = await record("cliente", device, "browser-query", false);
        assert.equal(absent.installed_at, null);
        assert.equal(absent.last_opened_at, null);
        const installed = await record("cliente", device, "appinstalled", true);
        assert.ok(Number.isFinite(Date.parse(installed.installed_at)));
        assert.equal(installed.last_opened_at, null);
        const opened = await record("cliente", device, "standalone", true);
        assert.equal(opened.installed_at, installed.installed_at);
        assert.ok(Number.isFinite(Date.parse(opened.last_opened_at)));
        const absentAgain = await record("cliente", device, "browser-query", false);
        assert.equal(absentAgain.installed, false);
        assert.equal(absentAgain.installed_at, installed.installed_at);
        assert.equal(absentAgain.last_opened_at, opened.last_opened_at);
        const reinstalled = await record("cliente", device, "appinstalled", true);
        assert.equal(reinstalled.installed_at, installed.installed_at);
        assert.equal(reinstalled.last_opened_at, opened.last_opened_at);
        const reopened = await record("cliente", device, "standalone", true);
        assert.equal(reopened.installed_at, installed.installed_at);
        assert.ok(Date.parse(reopened.last_opened_at) >= Date.parse(opened.last_opened_at));
      },
    );
    await t.test("same account has independent devices and all three app profiles", async () => {
      await record("cliente", otherDevice, "browser-query", false);
      await record("estabelecimento", device, "standalone", true);
      await record("entrega", device, "browser-query", false);
      const { rows } = await db.query("SELECT * FROM public.user_app_installs");
      assert.equal(rows.length, 4);
      assert.equal(rows.filter((row) => row.installed).length, 2);
    });
    await t.test("invalid evidence and profiles fail in the database", async () => {
      for (const evidence of ["appinstalled", "standalone"]) {
        await assert.rejects(record("cliente", device, evidence, false), /evidence/i);
      }
      await assert.rejects(record("admin", device, "standalone", true), /app.type/i);
      await assert.rejects(record("cliente", device, "click", true), /evidence/i);
      await assert.rejects(record("cliente", device, null, true), /evidence/i);
      await assert.rejects(record("cliente", null, "standalone", true), /installation/i);
    });
    await t.test(
      "direct writes cannot spoof owner, timestamps, or immutable identity",
      async () => {
        await assert.rejects(
          db.query(
            `INSERT INTO public.user_app_installs
        (user_id, app_type, installation_id, installed, evidence)
        VALUES ($1, 'cliente', $2, true, 'standalone')`,
            [bob, otherDevice],
          ),
          /row.level security/i,
        );
        await assert.rejects(
          db.exec("UPDATE public.user_app_installs SET installed_at = '2000-01-01'"),
          /permission denied/i,
        );
        await assert.rejects(
          db.exec(`UPDATE public.user_app_installs SET user_id = '${bob}'`),
          /permission denied/i,
        );
        await assert.rejects(
          db.exec(`UPDATE public.user_app_installs SET installation_id = '${otherDevice}'`),
          /permission denied/i,
        );
        await assert.rejects(db.exec("DELETE FROM public.user_app_installs"), /permission denied/i);
        await assert.rejects(
          db.query(
            `INSERT INTO public.user_app_installs
        (user_id, app_type, installation_id, installed, evidence, installed_at)
        VALUES ($1, 'entrega', $2, true, 'standalone', '2000-01-01')`,
            [alice, otherDevice],
          ),
          /permission denied/i,
        );
        // Allowed direct writes receive exactly the same trigger validation as RPC calls.
        await assert.rejects(
          db.exec("UPDATE public.user_app_installs SET installed = false, evidence = 'standalone'"),
          /evidence/i,
        );
        const before = Date.now();
        await db.query(
          "UPDATE public.user_app_installs SET installed = true, evidence = 'appinstalled' WHERE app_type = 'cliente' AND installation_id = $1",
          [otherDevice],
        );
        const direct = (
          await db.query(
            "SELECT * FROM public.user_app_installs WHERE app_type = 'cliente' AND installation_id = $1",
            [otherDevice],
          )
        ).rows[0];
        assert.ok(+direct.installed_at >= before - 1);
        assert.ok(+direct.installed_at <= Date.now());
        assert.equal(direct.last_opened_at, null);
        await record("cliente", otherDevice, "browser-query", false);
      },
    );
    await t.test("a second user cannot see or alter the first user's records", async () => {
      await signIn(bob);
      assert.equal((await db.query("SELECT * FROM public.user_app_installs")).rows.length, 0);
      await db.exec(
        "UPDATE public.user_app_installs SET installed = false, evidence = 'browser-query'",
      );
      const own = await record("cliente", device, "browser-query", false);
      assert.equal(own.user_id, bob);
      assert.equal((await db.query("SELECT * FROM public.user_app_installs")).rows.length, 1);
      await signIn(alice);
      assert.equal(
        (await db.query("SELECT * FROM public.user_app_installs WHERE installed")).rows.length,
        2,
      );
    });
    await t.test("anonymous and missing-sub callers cannot read or write", async () => {
      await db.exec(
        "RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claim.sub', '', false)",
      );
      await assert.rejects(
        db.query("SELECT * FROM public.user_app_installs"),
        /permission denied/i,
      );
      await assert.rejects(record("cliente", device, "standalone", true), /permission denied/i);
      await signIn("");
      await assert.rejects(record("cliente", device, "standalone", true), /authenticated/i);
      assert.equal((await db.query("SELECT * FROM public.user_app_installs")).rows.length, 0);
    });
  } finally {
    await db.close();
  }
});
