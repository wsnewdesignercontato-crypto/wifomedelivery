import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { APP_PROFILES } from "../src/lib/app-profiles.ts";
import { loadTsx } from "./helpers/load-tsx.mjs";

const hooks = loadTsx();
const module = await import("../src/components/app-download-options.tsx").catch((error) => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return null;
  throw error;
});
hooks.deregister();

test("each role offers only its own app and hides the whole bar when installed", () => {
  assert.ok(module?.AppDownloadOptions, "Downloads need independent per-app choices");
  for (const current of Object.keys(APP_PROFILES)) {
    for (const installed of [false, true]) {
      const html = renderToStaticMarkup(
        createElement(module.AppDownloadOptions, {
          perfilAtual: current,
          instalado: installed,
          busy: false,
          onInstall: () => assert.fail("Rendering must not invoke the native installer"),
        }),
      );
      const currentDownload = html.match(/<button\b[^>]*aria-label="([^"]+)"/);
      assert.equal(
        currentDownload?.[1] ?? null,
        installed ? null : `Baixar ${APP_PROFILES[current].name}`,
      );
      const links = [...html.matchAll(/<a\b([^>]+)>/g)].map((match) => match[1]);
      assert.equal(links.length, 0, "Other profiles must never appear inside this install bar");
      for (const other of Object.keys(APP_PROFILES).filter((profile) => profile !== current)) {
        assert.ok(!html.includes(`src="${APP_PROFILES[other].icon}"`));
        assert.ok(!html.includes(`aria-label="Baixar ${APP_PROFILES[other].name}"`));
      }
      if (installed) assert.equal(html, "");
    }
  }
});

test("Android without a native offer keeps useful guidance clickable; ready offers install directly", () => {
  for (const current of Object.keys(APP_PROFILES)) {
    const render = (state) =>
      renderToStaticMarkup(
        createElement(module.AppDownloadOptions, {
          perfilAtual: current,
          instalado: false,
          busy: false,
          android: true,
          onInstall: () => {},
          ...state,
        }),
      );
    const ready = render({ nativeReady: true });
    assert.ok(!ready.includes('disabled=""'));
    assert.ok(ready.includes("Instalar"));
    assert.ok(!ready.includes("Preparando"));
    const unavailable = render({ nativeReady: false });
    assert.ok(!unavailable.includes('disabled=""'));
    assert.ok(unavailable.includes("Como instalar"));
    assert.ok(unavailable.includes("opções de instalação no Chrome"));
  }
});

test("unsupported Android browsers offer a direct Chrome action for this profile", () => {
  for (const current of Object.keys(APP_PROFILES)) {
    const html = renderToStaticMarkup(
      createElement(module.AppDownloadOptions, {
        perfilAtual: current,
        instalado: false,
        busy: false,
        android: true,
        openChrome: true,
        onInstall: () => {},
      }),
    );
    assert.ok(html.includes(`aria-label="Abrir ${APP_PROFILES[current].name} no Chrome"`));
    assert.ok(!html.includes('disabled=""'));
  }
});
