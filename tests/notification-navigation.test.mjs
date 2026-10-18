import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
} from "@tanstack/react-router";
import { loadTsx } from "./helpers/load-tsx.mjs";
const runtime = {
  navigations: [],
  notification: {
    id: "notice",
    titulo: "Loja pendente",
    mensagem: "Analise a loja",
    lida: false,
    created_at: new Date().toISOString(),
    link_url: "/admin/estabelecimentos?loja=20000000-0000-4000-8000-000000000001",
  },
};
globalThis.__notificationNavigationTest = runtime;
const jsx = loadTsx();
const modules = {
  react: `export * from ${JSON.stringify(import.meta.resolve("react"))};
    export const useState=value=>[Array.isArray(value)?[globalThis.__notificationNavigationTest.notification]:value,()=>{}];
    export const useEffect=()=>{};`,
  "@tanstack/react-router":
    "export const useNavigate=()=>args=>globalThis.__notificationNavigationTest.navigations.push(args);",
  "@/integrations/supabase/client":
    "export const supabase={from:()=>({update:()=>({eq:async()=>({error:null})})})};",
  "@/hooks/use-push-notifications":
    "export const usePushNotifications=()=>({supported:false}); export const setAppBadgeCount=()=>{};",
};
const hooks = registerHooks({
  resolve(name, context, next) {
    if (name === "react" && !context.parentURL?.endsWith("/notifications-bell.tsx"))
      return next(name, context);
    if (modules[name])
      return {
        url: "data:text/javascript," + encodeURIComponent(modules[name]),
        shortCircuit: true,
      };
    return next(name, context);
  },
});
const { NotificationsBell } = await import("../src/components/cliente/notifications-bell.tsx");
hooks.deregister();
jsx.deregister();
function find(node, predicate) {
  if (!node || typeof node !== "object") return;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = find(child, predicate);
    if (found) return found;
  }
}
test("clicking an approval notification preserves its route and store query in the real router", async () => {
  const previous = globalThis.window;
  globalThis.window = { location: { origin: "https://pedetrem.vercel.app" } };
  try {
    const button = find(
      NotificationsBell({ userId: "admin", audience: "admin" }),
      (node) =>
        node.type === "button" && !!find(node, (n) => n.props?.children === "Loja pendente"),
    );
    assert.ok(button);
    await button.props.onClick();
    const root = createRootRoute();
    const route = createRoute({ getParentRoute: () => root, path: "/admin/estabelecimentos" });
    const router = createRouter({
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    const location = router.buildLocation(runtime.navigations.at(-1));
    assert.equal(location.pathname, "/admin/estabelecimentos");
    assert.equal(location.search.loja, "20000000-0000-4000-8000-000000000001");
    assert.equal(
      router.matchRoutes(location.pathname, location.search).at(-1).routeId,
      "/admin/estabelecimentos",
    );
  } finally {
    globalThis.window = previous;
  }
});
