import assert from "node:assert/strict";
import { defaultParseSearch } from "@tanstack/router-core";
import { APP_PROFILES, profileInstallUrl } from "../src/lib/app-profiles.ts";

const origin = new URL(process.argv[2] ?? "http://127.0.0.1:3000").origin;
function links(html, rel) {
  return [...html.matchAll(/<link\b[^>]*>/gi)]
    .filter(([tag]) => new RegExp(`\\brel=["']${rel}["']`, "i").test(tag))
    .map(([tag]) => tag.match(/\bhref=["']([^"']+)["']/i)?.[1]);
}
for (const profile of ["estabelecimento", "entregador", "cliente"]) {
  const response = await fetch(
    `${origin}/auth?perfil=${profile}&confirmado=1&redirect=${encodeURIComponent("/" + profile)}`,
    {
      signal: AbortSignal.timeout(20000),
    },
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  const otherApps = html.match(
    /<nav\b[^>]*aria-label="Outros aplicativos PedeTrem"[^>]*>([\s\S]*?)<\/nav>/,
  )?.[1];
  assert.ok(otherApps, `${profile}: other app downloads must be present in the rendered page`);
  for (const other of Object.keys(APP_PROFILES).filter((item) => item !== profile)) {
    assert.ok(
      otherApps.includes(`href="${profileInstallUrl(other)}"`),
      `${profile}: missing ${other} download`,
    );
  }
  const expected = `/manifest-${profile}.webmanifest`;
  assert.deepEqual(
    links(html, "manifest"),
    [expected],
    `Initial HTML must identify ${profile} before JavaScript executes`,
  );
  assert.equal(new URL(response.url).pathname, `/${profile}/entrar`);
  if (Object.values(APP_PROFILES).some((app) => app.origin === origin))
    assert.equal(new URL(response.url).origin, APP_PROFILES[profile].origin);
  const returnedSearch = defaultParseSearch(new URL(response.url).search);
  assert.equal(returnedSearch.confirmado, "1");
  assert.equal(returnedSearch.redirect, "/" + profile);
  const manifestResponse = await fetch(new URL(expected, origin));
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.name, "PedeTrem");
  assert.equal(manifest.short_name, "PedeTrem");
  assert.equal(manifest.id, `/wifome-${profile}`);
  assert.equal(manifest.scope, `/${profile}`);
  assert.ok(new URL(manifest.start_url, origin).pathname.startsWith(manifest.scope));
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable" && icon.sizes === "512x512"));
  const appleIcons = links(html, "apple-touch-icon");
  assert.equal(appleIcons.length, 1);
  assert.ok(appleIcons[0].includes(profile));
  const appleResponse = await fetch(new URL(appleIcons[0], origin));
  assert.equal(appleResponse.status, 200);
  const apple = Buffer.from(await appleResponse.arrayBuffer());
  assert.equal(apple.readUInt32BE(16), 180);
  assert.equal(apple.readUInt32BE(20), 180);
  const favicons = links(html, "icon");
  assert.equal(favicons.length, 1);
  assert.equal((await fetch(new URL(favicons[0], origin))).status, 200);
  for (const icon of manifest.icons) {
    const iconResponse = await fetch(new URL(icon.src, origin));
    assert.equal(iconResponse.status, 200);
    const png = Buffer.from(await iconResponse.arrayBuffer());
    assert.equal(icon.sizes, `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`);
  }
  console.log(
    `${profile}: raw HTML, scoped login, stable identity, adaptive and Apple icons passed`,
  );
}
