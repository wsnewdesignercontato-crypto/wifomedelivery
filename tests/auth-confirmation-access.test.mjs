import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";
const r = {};
globalThis.__confirmationAccess = r;
const mocks = {
  "@tanstack/react-router": `export const Outlet='outlet';export const createFileRoute=()=>options=>options;export const redirect=options=>Object.assign(new Error('REDIRECT'),options);`,
  "@/integrations/supabase/client": `export const supabase={auth:{getUser:async()=>({data:{user:globalThis.__confirmationAccess.user},error:null}),signOut:async()=>{globalThis.__confirmationAccess.signouts++;return{error:null}}}};`,
  "@tanstack/react-start": `export const createMiddleware=()=>({server:fn=>fn});`,
  "@tanstack/react-start/server": `export const getRequest=()=>({headers:new Headers({authorization:'Bearer header.payload.signature'})});`,
  "@supabase/supabase-js": `export const createClient=()=>({auth:{getClaims:async()=>({data:{claims:{sub:'actor'}},error:null}),getUser:async()=>({data:{user:globalThis.__confirmationAccess.user},error:null})},rpc:async()=>{globalThis.__confirmationAccess.rpc++;return{error:globalThis.__confirmationAccess.blocked?{}:null}}});`,
  "@/lib/supabase-config": `export const getPublicSupabaseConfig=()=>({url:'https://example.invalid',key:'public-fixture'});`,
};
const jsx = loadTsx();
const hook = registerHooks({
  resolve(s, c, n) {
    if (mocks[s])
      return { url: "data:text/javascript," + encodeURIComponent(mocks[s]), shortCircuit: true };
    return n(s, c);
  },
});
const { Route } = await import("../src/routes/_authenticated/route.tsx");
const { requireSupabaseAuth } = await import("../src/integrations/supabase/auth-middleware.ts");
hook.deregister();
jsx.deregister();
function reset(confirmed) {
  Object.assign(r, {
    user: {
      id: "actor",
      email: "fixture@example.invalid",
      email_confirmed_at: confirmed ? "2026-10-19T00:00:00Z" : null,
    },
    signouts: 0,
    rpc: 0,
    blocked: false,
  });
}
for (const path of ["/cliente/checkout", "/estabelecimento/pedidos", "/entregador/corridas"]) {
  test(`unconfirmed accounts cannot open ${path} by URL`, async () => {
    reset(false);
    await assert.rejects(
      Route.beforeLoad({ location: { pathname: path, searchStr: "" } }),
      (e) => e.message === "REDIRECT" && e.to.endsWith("/entrar"),
    );
    assert.equal(r.signouts, 1);
  });
  test(`confirmed accounts retain access to ${path}`, async () => {
    reset(true);
    const result = await Route.beforeLoad({ location: { pathname: path, searchStr: "" } });
    assert.equal(result.user.id, "actor");
    assert.equal(result.isGuest, false);
  });
}
test("an unconfirmed account may browse only as a guest", async () => {
  reset(false);
  const result = await Route.beforeLoad({ location: { pathname: "/cliente", searchStr: "" } });
  assert.equal(result.isGuest, true);
  assert.equal(result.user.id, "");
});
test("server functions reject unconfirmed users even with a valid signed JWT", async () => {
  reset(false);
  await assert.rejects(
    requireSupabaseAuth({ next: () => ({ allowed: true }) }),
    /Confirme seu e-mail/,
  );
  assert.equal(r.rpc, 0);
});
test("confirmed server callers still pass the blocked-account gate", async () => {
  reset(true);
  assert.equal((await requireSupabaseAuth({ next: () => ({ allowed: true }) })).allowed, true);
  r.blocked = true;
  await assert.rejects(requireSupabaseAuth({ next: () => ({ allowed: true }) }), /bloqueada/);
});
test("server functions refuse a mismatched current Auth identity", async () => {
  reset(true);
  r.user.id = "someone-else";
  await assert.rejects(
    requireSupabaseAuth({ next: () => ({ allowed: true }) }),
    /verificar a conta/,
  );
});
