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
