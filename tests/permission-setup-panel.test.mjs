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
const { PermissionSetupPanel } = await import("../src/components/permission-setup-panel.tsx");
hooks.deregister();

function panel(profile, permission = "denied", busy = null) {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const nativeRequest = () => assert.fail("Rendering must never request a native permission");
  return renderToStaticMarkup(
    createElement(
      RouterContextProvider,
      { router },
      createElement(PermissionSetupPanel, {
        profile,
        snapshot: {
          installed: true,
          notifications: permission,
          location: permission,
          locationEnabled: false,
          pushOptIn: null,
        },
        busy,
        error: "",
        onNotifications: nativeRequest,
        onLocation: nativeRequest,
        onDismiss() {},
        onRefresh() {},
      }),
    ),
  );
}

test("denied, unsupported and pending permissions always offer an enabled continue-for-now button", () => {
  for (const [permission, busy] of [
    ["denied", null],
    ["unsupported", null],
    ["prompt", "location"],
  ]) {
    const html = panel("cliente", permission, busy);
    const button = html.match(/<button\b[^>]*>Continuar por enquanto<\/button>/)?.[0];
    assert.ok(button);
    assert.doesNotMatch(button, /\sdisabled(?:=|\s|>)/);
  }
});

test("each installed app's permission screen uses the matching approved logo", () => {
  for (const profile of ["cliente", "estabelecimento", "entregador"]) {
    const html = panel(profile);
    assert.ok(html.includes(`src="/icons/${profile}-any-512-v2.png"`));
    assert.ok(html.includes("Como liberar nos ajustes"));
  }
});

test("a native grant without app opt-in still offers notification activation", () => {
  assert.ok(panel("cliente", "granted").includes("Ativar notificações"));
});
