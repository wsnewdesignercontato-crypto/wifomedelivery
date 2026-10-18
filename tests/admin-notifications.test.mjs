import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";

const jsx = loadTsx();
const modules = {
  "@tanstack/react-router": `export const Link='a',Outlet='outlet';
    export const useRouterState=()=>'/admin';
    export const useNavigate=()=>()=>{};
    export const useLocation=()=>({pathname:'/admin',searchStr:''});
    export const useRouteContext=()=>({user:{id:'current-admin-id'}});`,
  "@/components/cliente/notifications-bell": "export const NotificationsBell='notifications-bell';",
  "@/components/theme-toggle": "export const ThemeToggle='theme-toggle';",
  "@/integrations/supabase/client": "export const supabase={auth:{signOut:async()=>{}}};",
  react: `export * from ${JSON.stringify(import.meta.resolve("react"))};
    export const useState=value=>[value,()=>{}];`,
};
const hooks = registerHooks({
  resolve(name, context, next) {
    if (name === "react" && !context.parentURL?.endsWith("/admin-shell.tsx"))
      return next(name, context);
    if (modules[name])
      return {
        url: "data:text/javascript," + encodeURIComponent(modules[name]),
        shortCircuit: true,
      };
    return next(name, context);
  },
});
const { AdminShell } = await import("../src/components/admin/admin-shell.tsx");
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
test("the admin header connects the real notification feed to the authenticated admin audience", () => {
  const bell = find(AdminShell(), (node) => node.type === "notifications-bell");
  assert.ok(bell, "the admin bell must be interactive, not a decorative icon");
  assert.equal(bell.props.userId, "current-admin-id");
  assert.equal(bell.props.audience, "admin");
});
