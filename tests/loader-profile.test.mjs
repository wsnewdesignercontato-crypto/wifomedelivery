import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createRouter,
  createRootRoute,
  createMemoryHistory,
  RouterContextProvider,
} from "@tanstack/react-router";
import { loadTsx } from "./helpers/load-tsx.mjs";

const hooks = loadTsx();
const { WifomeLoader } = await import("../src/components/wifome-loader.tsx");
hooks.deregister();

function renderLoader(from, to, profile) {
  const history = createMemoryHistory({ initialEntries: [from] });
  const router = createRouter({ history, routeTree: createRootRoute() });
  // The address changes before the pending navigation commits its route store.
  history.push(to);
  router.updateLatestLocation();
  return renderToStaticMarkup(
    createElement(
      RouterContextProvider,
      { router },
      createElement(WifomeLoader, { perfil: profile }),
    ),
  );
}

test("returning from the store to the landing page loads the red customer brand immediately", () => {
  const html = renderLoader("/estabelecimento", "/");
  assert.ok(html.includes('src="/icons/cliente-any-512-v2.png"'));
  assert.ok(!html.includes('src="/icons/estabelecimento-any-512-v2.png"'));
  assert.match(html, /class="theme-cliente /);
});

test("pending navigation into another app uses the destination brand before it commits", () => {
  const html = renderLoader("/cliente", "/entregador/entrar");
  assert.ok(html.includes('src="/icons/entregador-any-512-v2.png"'));
  assert.match(html, /class="theme-entregador /);
});

test("an explicit onboarding profile keeps its own loading brand", () => {
  const html = renderLoader("/", "/", "estabelecimento");
  assert.ok(html.includes('src="/icons/estabelecimento-any-512-v2.png"'));
  assert.match(html, /class="theme-estab /);
});
