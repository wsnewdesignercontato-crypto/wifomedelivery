import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  APP_PROFILES,
  appProfileFromUrl,
  relatedAppMatches,
  systemInstallationEvidence,
} from "../src/lib/app-profiles.ts";

test("three profiles preserve distinct installed identities, names, colors and icons", () => {
  const apps = Object.values(APP_PROFILES);
  for (const key of ["id", "shortName", "color", "icon"])
    assert.equal(new Set(apps.map((app) => app[key])).size, 3);
  for (const [profile, app] of Object.entries(APP_PROFILES)) {
    const manifest = JSON.parse(
      readFileSync(new URL("../public" + app.manifest, import.meta.url), "utf8"),
    );
    assert.equal(manifest.id, app.id);
    assert.equal(manifest.short_name, app.shortName);
    assert.equal(manifest.theme_color, app.color);
    assert.ok(manifest.start_url.includes(profile));
    assert.equal(manifest.related_applications.length, 3);
    const png = readFileSync(new URL("../public" + manifest.icons[0].src, import.meta.url));
    assert.equal(manifest.icons[0].sizes, `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`);
    assert.ok(png.readUInt32BE(16) >= 512);
  }
});
test("OS evidence can change from installed to removed, independently for each app", async () => {
  const origin = "https://pedetrem.vercel.app";
  const query = async () => [{ platform: "webapp", id: origin + "/wifome-estabelecimento" }];
  assert.equal(await systemInstallationEvidence("estabelecimento", origin, null, query), true);
  assert.equal(await systemInstallationEvidence("cliente", origin, null, query), false);
  assert.equal(
    await systemInstallationEvidence("estabelecimento", origin, null, async () => []),
    false,
  );
  assert.equal(await systemInstallationEvidence("entregador", origin, "entregador"), true);
  assert.equal(await systemInstallationEvidence("cliente", origin, null), null);
  assert.equal(
    await systemInstallationEvidence("cliente", origin, null, async () => {
      throw Error("unavailable");
    }),
    null,
  );
});
test("role is derived from exact paths and login parameters", () => {
  assert.equal(appProfileFromUrl("/auth", "?perfil=entregador"), "entregador");
  assert.equal(appProfileFromUrl("/estabelecimento/pedidos", "?perfil=cliente"), "estabelecimento");
  assert.equal(appProfileFromUrl("/cliente", "?perfil=entregador"), "cliente");
  assert.equal(appProfileFromUrl("/auth", "?perfil=estabelecimento-falso"), "cliente");
});
test("an installed app never hides a different role or an unrelated origin", () => {
  const origin = "https://pedetrem.vercel.app";
  const app = {
    platform: "webapp",
    id: origin + "/wifome-entregador",
    url: origin + "/manifest-entregador.webmanifest?v=old",
  };
  assert.ok(relatedAppMatches(app, "entregador", origin));
  assert.ok(!relatedAppMatches(app, "cliente", origin));
  assert.ok(
    !relatedAppMatches(
      {
        ...app,
        id: "https://evil.example/wifome-cliente",
        url: "https://evil.example/manifest-cliente.webmanifest",
      },
      "cliente",
      origin,
    ),
  );
  assert.ok(!relatedAppMatches({ ...app, platform: "play" }, "entregador", origin));
});
