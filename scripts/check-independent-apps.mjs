import assert from "node:assert/strict";

const apps = [
  { profile: "cliente", origin: "https://pedetrem.vercel.app", color: "#E10B17" },
  { profile: "estabelecimento", origin: "https://pedetrem-loja.vercel.app", color: "#F58206" },
  { profile: "entregador", origin: "https://pedetrem-entregador.vercel.app", color: "#07883B" },
];
const get = (url, options = {}) => fetch(url, { signal: AbortSignal.timeout(20000), ...options });
async function main() {
  const landing = await get(apps[0].origin);
  assert.equal(landing.status, 200);
  const landingHtml = await landing.text();
  for (const app of apps)
    assert.ok(
      landingHtml.includes(`href="${app.origin}/${app.profile}/entrar"`),
      `Landing must open the independent ${app.profile} entry`,
    );

  const identities = new Set();
  for (const { profile, origin, color } of apps) {
    if (profile !== "cliente") {
      const old = await get(`${apps[0].origin}/${profile}/entrar?confirmado=1`, {
        redirect: "manual",
      });
      assert.equal(
        old.status,
        307,
        `Legacy ${profile} entry must not serve an installable page on the customer origin`,
      );
      assert.equal(old.headers.get("location"), `${origin}/${profile}/entrar?confirmado=1`);
    }
    if (profile !== "cliente") {
      const root = await get(origin + "/?app=" + profile, { redirect: "manual" });
      assert.equal(root.status, 307, `The ${profile} host root must open its own app`);
      const target = new URL(root.headers.get("location"), origin);
      assert.equal(target.origin, origin);
      assert.equal(target.pathname, `/${profile}/entrar`);
      assert.equal(target.searchParams.get("app"), profile);
    }
    const page = await get(`${origin}/${profile}/entrar`);
    assert.equal(page.status, 200);
    assert.equal(new URL(page.url).origin, origin);
    const html = await page.text();
    const otherApps = html.match(
      /<nav\b[^>]*aria-label="Outros aplicativos PedeTrem"[^>]*>([\s\S]*?)<\/nav>/,
    )?.[1];
    assert.ok(otherApps, `${profile}: other app downloads must remain reachable`);
    for (const other of apps.filter((app) => app.profile !== profile)) {
      assert.ok(
        otherApps.includes(`href="${other.origin}/${other.profile}/entrar"`),
        `${profile}: missing ${other.profile} download`,
      );
    }
    const manifests = [...html.matchAll(/<link\b[^>]*rel="manifest"[^>]*>/g)];
    assert.equal(manifests.length, 1);
    const manifestPath = manifests[0][0].match(/href="([^"]+)"/)[1];
    assert.equal(manifestPath, `/manifest-${profile}.webmanifest`);
    assert.ok(html.includes(`/icons/${profile}-apple-v2.png`));
    assert.ok(html.includes(`/icons/${profile}-any-512-v2.png`));
    const response = await get(origin + manifestPath);
    assert.equal(response.status, 200);
    const manifest = await response.json();
    assert.equal(manifest.name, "PedeTrem");
    assert.equal(manifest.short_name, "PedeTrem");
    assert.equal(manifest.id, `/wifome-${profile}`);
    assert.equal(manifest.scope, `/${profile}`);
    assert.equal(manifest.theme_color, color);
    assert.equal(new URL(manifest.start_url, origin).origin, origin);
    assert.ok(new URL(manifest.start_url, origin).pathname.startsWith(manifest.scope));
    assert.deepEqual(manifest.related_applications, [
      { platform: "webapp", url: manifestPath, id: `/wifome-${profile}` },
    ]);
    identities.add(new URL(manifest.id, origin).href);
    for (const icon of manifest.icons) {
      const image = await get(new URL(icon.src, origin));
      assert.equal(image.status, 200);
      const png = Buffer.from(await image.arrayBuffer());
      assert.equal(icon.sizes, `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`);
    }
    const worker = await get(origin + "/push-sw.js");
    assert.equal(worker.status, 200);
    console.log(
      `${profile}: HTTPS, other app downloads, isolated entry, initial manifest, self association, icons and worker passed`,
    );
  }
  assert.equal(identities.size, 3);
  console.log(
    "Three distinct production origins and installation identities verified; physical phone installation remains unobserved.",
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
