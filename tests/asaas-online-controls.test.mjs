import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";
globalThis.__onlineReadiness = { enabled: false, canEnable: false, requestedEnabled: false };
const jsx = loadTsx();
const mocks = {
  "@tanstack/react-start": "export const useServerFn=x=>x;",
  "@tanstack/react-query":
    "export const useQuery=()=>({data:globalThis.__onlineReadiness,error:null});",
  "@/lib/admin-asaas.functions":
    "export const getAsaasOnlineStatus=async()=>{},setAsaasOnlineEnabled=async()=>{},diagnoseAsaasSandbox=async()=>{};",
  "@/components/ui/button": "export const Button='button';",
  sonner: "export const toast={error(){},success(){}};",
};
const hooks = registerHooks({
  resolve(n, c, next) {
    return mocks[n]
      ? { url: "data:text/javascript," + encodeURIComponent(mocks[n]), shortCircuit: true }
      : next(n, c);
  },
});
const { AsaasOnlineControls } = await import("../src/components/admin/asaas-online-controls.tsx");
hooks.deregister();
jsx.deregister();
test("blocked checkout explains the production setup steps, while a ready checkout can be enabled", () => {
  let html = renderToStaticMarkup(React.createElement(AsaasOnlineControls));
  assert.match(html, /Para liberar o botão/);
  assert.match(html, /Registrar\/atualizar webhook/);
  assert.match(html, /<button disabled="">Ativar pagamentos em produção/);
  globalThis.__onlineReadiness.canEnable = true;
  html = renderToStaticMarkup(React.createElement(AsaasOnlineControls));
  assert.match(html, /Conexão e webhook de produção verificados/);
  assert.match(html, /<button>Ativar pagamentos em produção/);
});
