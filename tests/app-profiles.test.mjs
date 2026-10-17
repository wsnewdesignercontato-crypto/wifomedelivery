import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pngPixels } from "./helpers/png-pixels.mjs";
import {
  APP_PROFILES,
  appProfileFromUrl,
  relatedAppMatches,
  systemInstallationEvidence,
  isProfileLoginPath,
} from "../src/lib/app-profiles.ts";

test("three profiles keep distinct identities and colors while sharing the PedeTrem launcher name", () => {
  const apps = Object.values(APP_PROFILES);
  for (const key of ["id", "color", "icon"])
    assert.equal(new Set(apps.map((app) => app[key])).size, 3);
  for (const [profile, app] of Object.entries(APP_PROFILES)) {
    const manifest = JSON.parse(
      readFileSync(new URL("../public" + app.manifest, import.meta.url), "utf8"),
    );
    assert.equal(manifest.id, app.id);
    assert.equal(manifest.name, "PedeTrem");
    assert.equal(manifest.short_name, "PedeTrem");
    assert.equal(manifest.short_name, app.shortName);
    assert.equal(manifest.theme_color, app.color);
    assert.ok(manifest.start_url.includes(profile));
    assert.deepEqual(manifest.related_applications, [
      { platform: "webapp", url: app.manifest, id: app.id },
    ]);
    const png = readFileSync(new URL("../public" + manifest.icons[0].src, import.meta.url));
    assert.equal(manifest.icons[0].sizes, `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`);
    assert.ok(png.readUInt32BE(16) >= 512);
  }
});
test("OS evidence can change from installed to removed, independently for each app", async () => {
  const origin = APP_PROFILES.estabelecimento.origin;
  const query = async () => [{ platform: "webapp", id: origin + "/wifome-estabelecimento" }];
  assert.equal(await systemInstallationEvidence("estabelecimento", origin, null, query), true);
  assert.equal(await systemInstallationEvidence("cliente", origin, null, query), false);
  assert.equal(
    await systemInstallationEvidence("estabelecimento", origin, null, async () => []),
    false,
  );
  assert.equal(
    await systemInstallationEvidence("entregador", APP_PROFILES.entregador.origin, "entregador"),
    true,
  );
  assert.equal(
    await systemInstallationEvidence("cliente", APP_PROFILES.cliente.origin, null),
    null,
  );
  assert.equal(
    await systemInstallationEvidence("cliente", APP_PROFILES.cliente.origin, null, async () => {
      throw Error("unavailable");
    }),
    null,
  );
});

test("each installation has its own scope and opens its matching login or customer catalog", () => {
  const origin = "https://pedetrem.vercel.app";
  const manifests = Object.entries(APP_PROFILES).map(([profile, app]) => ({
    profile,
    manifest: JSON.parse(readFileSync(new URL("../public" + app.manifest, import.meta.url))),
  }));
  for (const { profile, manifest } of manifests) {
    assert.equal(manifest.scope, "/" + profile);
    assert.ok(new URL(manifest.start_url, origin).pathname.startsWith(manifest.scope));
    for (const other of manifests.filter((item) => item.profile !== profile))
      assert.ok(!manifest.scope.startsWith(other.manifest.scope));
    if (profile !== "cliente")
      assert.equal(new URL(manifest.start_url, origin).pathname, "/" + profile + "/entrar");
  }
});

test("phone installation offers exact 192/512 icons and a dedicated adaptive icon", () => {
  for (const app of Object.values(APP_PROFILES)) {
    const manifest = JSON.parse(readFileSync(new URL("../public" + app.manifest, import.meta.url)));
    for (const size of [192, 512]) {
      const icon = manifest.icons.find(
        (candidate) => candidate.sizes === `${size}x${size}` && candidate.purpose === "any",
      );
      assert.ok(icon, `Missing ordinary ${size}px icon for ${app.name}`);
    }
    const adaptive = manifest.icons.find(
      (icon) => icon.purpose === "maskable" && icon.sizes === "512x512",
    );
    assert.ok(adaptive, `Missing adaptive icon for ${app.name}`);
    assert.notEqual(
      adaptive.src,
      app.icon,
      "Installation artwork has an explicit export separate from the in-app logo",
    );
  }
});
test("role is derived from exact paths and login parameters", () => {
  assert.equal(appProfileFromUrl("/auth", "?perfil=entregador"), "entregador");
  assert.equal(appProfileFromUrl("/estabelecimento/pedidos", "?perfil=cliente"), "estabelecimento");
  assert.equal(appProfileFromUrl("/cliente", "?perfil=entregador"), "cliente");
  assert.equal(appProfileFromUrl("/auth", "?perfil=estabelecimento-falso"), "cliente");
});

test("only the three exact scoped login paths are public authentication entry points", () => {
  for (const profile of Object.keys(APP_PROFILES)) {
    assert.ok(isProfileLoginPath(`/${profile}/entrar`));
    assert.ok(!isProfileLoginPath(`/${profile}/entrar-extra`));
    assert.ok(!isProfileLoginPath(`/${profile}`));
  }
});

test("every phone icon is opaque at every pixel and has colored edges without a white frame", () => {
  for (const app of Object.values(APP_PROFILES)) {
    const manifest = JSON.parse(readFileSync(new URL("../public" + app.manifest, import.meta.url)));
    for (const path of [...manifest.icons.map((icon) => icon.src), app.appleIcon]) {
      const image = pngPixels(readFileSync(new URL("../public" + path, import.meta.url)));
      for (let y = 0; y < image.height; y++)
        for (let x = 0; x < image.width; x++) {
          const [r, g, b, alpha] = image.at(x, y);
          assert.equal(alpha, 255, `${path}: transparent pixel at ${x},${y}`);
          if (x === 0 || y === 0 || x === image.width - 1 || y === image.height - 1)
            assert.ok(!(r > 240 && g > 240 && b > 240), `${path}: white frame at ${x},${y}`);
        }
    }
  }
});
test("an installed app never hides a different role or an unrelated origin", () => {
  const origin = APP_PROFILES.entregador.origin;
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

test("a legacy store installation on the customer origin cannot hide the independent store installation", async () => {
  const origin = APP_PROFILES.cliente.origin;
  const old = {
    platform: "webapp",
    id: origin + "/wifome-estabelecimento",
    url: origin + "/manifest-estabelecimento.webmanifest",
  };
  assert.equal(relatedAppMatches(old, "estabelecimento", origin), false);
  assert.equal(
    await systemInstallationEvidence("estabelecimento", origin, "estabelecimento", async () => [
      old,
    ]),
    false,
  );
});
