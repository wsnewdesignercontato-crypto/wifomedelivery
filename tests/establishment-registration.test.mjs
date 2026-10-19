import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";
const r = { states: [], cursor: 0, effects: [], notices: [], writes: [] };
globalThis.__storeRegistration = r;
const jsx = loadTsx();
const mocks = {
  "@/components/store-location-editor": "export const StoreLocationEditor='store-location';",
  react: `export * from ${JSON.stringify(import.meta.resolve("react"))};const r=globalThis.__storeRegistration;
export function useState(v){const i=r.cursor++;if(!(i in r.states))r.states[i]=typeof v==='function'?v():v;return[r.states[i],v=>r.states[i]=typeof v==='function'?v(r.states[i]):v]}
export function useRef(v){const i=r.cursor++;return r.states[i]??={current:v}}
export function useEffect(fn,deps){const i=r.cursor++;const prev=r.states[i];if(!prev||deps.some((v,j)=>!Object.is(v,prev[j]))){r.states[i]=deps;r.effects.push(fn)}}`,
  "@tanstack/react-router": `export const createFileRoute=()=>o=>({...o,useRouteContext:()=>({user:{id:'owner'}})});export const Outlet='outlet';export const useLocation=()=>({pathname:'/estabelecimento'});`,
  "@tanstack/react-query": `const r=globalThis.__storeRegistration;export const useQueryClient=()=>({cancelQueries:async()=>{},setQueryData:(k,v)=>r.cached=v,invalidateQueries:()=>{}});`,
  "@/hooks/use-my-estab": `export const useMyEstab=()=>({estab:globalThis.__storeRegistration.estab,userId:'owner'});`,
  "@/hooks/use-estab": `export const useEstab=()=>({data:globalThis.__storeRegistration.estab,isLoading:false,error:globalThis.__storeRegistration.readError,refetch:async()=>{}});`,
  "@/hooks/use-niche-catalog": `export const useNicheCatalog=()=>({data:[],isError:false});`,
  "@/lib/profile-completion": `export const confirmProfileSaved=async()=>({complete:true});export const savedProfileMessage=()=>"Dados salvos";`,
  "@/components/push-toggle-card": `export const PushToggleCard='push';`,
  "@/components/estabelecimento/estab-shell": `export const EstabShell='shell';`,
  "@/components/onboarding-gate": `export const OnboardingGate='gate';`,
  "@/components/ifome-logo": `export const IFomeLogo='logo';`,
  "@/integrations/supabase/client": `const r=globalThis.__storeRegistration;export const supabase={from:()=>{let patch;const q={update:v=>{patch=v;r.writes.push(v);return q},eq:()=>q,is:()=>q,select:()=>q,single:async()=>r.fail?{data:null,error:{message:'Offline'}}:{data:{...r.estab,...patch},error:null}};return q}};`,
  sonner: `const r=globalThis.__storeRegistration;export const toast={success:m=>r.notices.push({kind:'success',message:m}),error:m=>r.notices.push({kind:'error',message:m})};`,
};
const hooks = registerHooks({
  resolve(name, ctx, next) {
    if (name === "react" && !/estabelecimento(?:\.configuracoes)?\.tsx$/.test(ctx.parentURL ?? ""))
      return next(name, ctx);
    if (mocks[name])
      return { url: "data:text/javascript," + encodeURIComponent(mocks[name]), shortCircuit: true };
    return next(name, ctx);
  },
});
const { Route } = await import("../src/routes/_authenticated/estabelecimento.configuracoes.tsx");
const { Route: Layout } = await import("../src/routes/_authenticated/estabelecimento.tsx");
hooks.deregister();
jsx.deregister();
function render() {
  r.cursor = 0;
  const t = Route.component();
  for (const fn of r.effects.splice(0)) fn();
  return t;
}
function find(n, p) {
  if (!n || typeof n !== "object") return;
  if (p(n)) return n;
  for (const c of [n.props?.children].flat(Infinity)) {
    const f = find(c, p);
    if (f) return f;
  }
}
function mount() {
  Object.assign(r, {
    states: [],
    cursor: 0,
    effects: [],
    notices: [],
    writes: [],
    fail: false,
    readError: null,
    estab: {
      id: "store",
      owner_id: "owner",
      nome: "Loja",
      telefone: "31999999999",
      taxa_entrega_cents: 990,
      pedido_minimo_cents: 1000,
      tempo_medio_min: 30,
      banco_conta: "123",
      cidade: "Cidade",
      endereco: "Rua",
    },
  });
  render();
  return render();
}
function edit(label, value) {
  const f = find(render(), (n) => n.props?.label === label);
  assert.ok(f, label);
  f.props.onChange(value);
}
function save() {
  return find(render(), (n) =>
    n.props?.children?.includes?.("Salvar todas as alterações"),
  ).props.onClick();
}
function field(label) {
  return find(render(), (n) => n.props?.label === label).props.value;
}
test("a background store refresh preserves edited contact and banking data", () => {
  mount();
  edit("Conta", "987");
  r.estab = { ...r.estab, telefone: "31888888888" };
  render();
  assert.equal(field("Conta"), "987");
});
test("saving a store sends only edited fields and preserves the other saved fields", async () => {
  mount();
  edit("Conta", "987");
  await save();
  assert.deepEqual(r.writes, [{ banco_conta: "987" }]);
  assert.equal(r.cached.telefone, "31999999999");
  assert.equal(r.cached.banco_conta, "987");
  assert.ok(r.notices.some((n) => n.kind === "success"));
});
test("a failed store save keeps the draft and has no success notification", async () => {
  mount();
  edit("Conta", "987");
  r.fail = true;
  await save();
  assert.equal(field("Conta"), "987");
  assert.ok(!r.notices.some((n) => n.kind === "success"));
  assert.ok(r.notices.some((n) => n.kind === "error"));
});
test("a failed store lookup shows retry rather than asking to register again", () => {
  mount();
  r.readError = new Error("Offline");
  r.estab = null;
  r.cursor = 0;
  const workspace = Layout.component();
  const tree = workspace.type();
  assert.equal(tree.props.role, "alert");
  assert.ok(find(tree, (n) => n.props?.children === "Tentar novamente"));
});

test("Brazilian decimal commas preserve the full delivery price", async () => {
  mount();
  edit("Taxa de entrega (R$)", "12,90");
  await save();
  assert.deepEqual(r.writes, [{ taxa_entrega_cents: 1290 }]);
});
test("invalid preparation times do not reach the database", async () => {
  mount();
  edit("Tempo médio (min)", "30min");
  await save();
  assert.equal(r.writes.length, 0);
  assert.ok(r.notices.some((n) => n.kind === "error"));
});

test("changing the store address clears the old pickup coordinates", async () => {
  mount();
  edit("Endereço", "Rua Nova, 123");
  await save();
  assert.equal(r.writes.length, 1);
  assert.equal(r.writes[0].lat, null);
  assert.equal(r.writes[0].lng, null);
});
