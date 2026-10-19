import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";
const initialDriver = {
  user_id: "driver",
  telefone: "31999999999",
  cnh: "12345678901",
  cpf: "00000000000",
  cidade_atuacao: "Cidade",
  status: "offline",
  endereco: { rua: "Rua", cidade: "Cidade" },
};
const r = {
  states: [],
  cursor: 0,
  effects: [],
  courier: structuredClone(initialDriver),
  profile: { id: "driver", nome: "Entregador", telefone: "31999999999", foto_url: null },
  notices: [],
  calls: [],
  fail: false,
  readError: null,
};
globalThis.__courierRegistrationTest = r;
const jsx = loadTsx();
const mocks = {
  react: `export * from ${JSON.stringify(import.meta.resolve("react"))}; const r=globalThis.__courierRegistrationTest;
 export function useState(initial){const i=r.cursor++; if(!(i in r.states))r.states[i]=typeof initial==='function'?initial():initial;return[r.states[i],v=>r.states[i]=typeof v==='function'?v(r.states[i]):v]}
 export function useRef(initial){const i=r.cursor++;return r.states[i]??={current:initial}}
 export function useEffect(fn,deps){const i=r.cursor++;const prior=r.states[i];if(!prior||deps.some((v,j)=>!Object.is(v,prior[j]))){r.states[i]=deps;r.effects.push(fn)}}`,
  "@tanstack/react-router": `export const createFileRoute=()=>options=>options; export const Link='a';`,
  "@tanstack/react-query": `const r=globalThis.__courierRegistrationTest;export const useQuery=()=>({data:r.profile,isLoading:false,error:r.readError,refetch:async()=>({})});export const useQueryClient=()=>({cancelQueries:async()=>{},setQueryData(key,value){if(key[0]==='courier')r.courier=value;else if(key[0]==='profile')r.profile=value},invalidateQueries(){}});`,
  "@/hooks/use-courier": `const r=globalThis.__courierRegistrationTest;export const useMyCourier=()=>({courier:r.courier,userId:'driver',isLoading:false,error:r.readError,refetch:async()=>({})});`,
  "@/lib/profile-completion": `export const savedProfileMessage=()=>"Dados salvos e confirmados";`,
  "@/lib/app-refresh": `export const notifyDataUpdated=()=>{};`,
  "@/integrations/supabase/client": `const r=globalThis.__courierRegistrationTest;export const supabase={rpc:async(name,args)=>{r.calls.push({name,args});if(r.fail)return {error:{message:'Falha de rede'},data:null}; const patch=args.p_patch;const {nome,...driver}=patch;r.persistedDriver={...r.courier,...driver};r.persistedProfile={...r.profile,...Object.fromEntries(Object.entries(patch).filter(([k])=>['nome','telefone','foto_url'].includes(k)))};return {error:null,data:{profile:r.persistedProfile,courier:r.persistedDriver,completion:{complete:true,missing:[],redirect:'/entregador/perfil/dados'}}}}};`,
  sonner: `const r=globalThis.__courierRegistrationTest;export const toast={success:x=>r.notices.push({kind:'success',message:x}),error:x=>r.notices.push({kind:'error',message:x})};`,
};
const hooks = registerHooks({
  resolve(name, ctx, next) {
    if (name === "react" && !ctx.parentURL?.endsWith("/entregador.perfil.dados.tsx"))
      return next(name, ctx);
    if (mocks[name])
      return { url: "data:text/javascript," + encodeURIComponent(mocks[name]), shortCircuit: true };
    return next(name, ctx);
  },
});
const { Route } = await import("../src/routes/_authenticated/entregador.perfil.dados.tsx");
const { registrationChanges } = await import("../src/lib/courier-registration.ts");
hooks.deregister();
jsx.deregister();
function find(n, p) {
  if (!n || typeof n !== "object") return;
  if (p(n)) return n;
  for (const c of [n.props?.children].flat(Infinity)) {
    const found = find(c, p);
    if (found) return found;
  }
}
function render() {
  r.cursor = 0;
  const tree = Route.component();
  for (const fn of r.effects.splice(0)) fn();
  return tree;
}
function mount() {
  Object.assign(r, {
    states: [],
    cursor: 0,
    effects: [],
    courier: structuredClone(initialDriver),
    profile: { id: "driver", nome: "Entregador", telefone: "31999999999", foto_url: null },
    notices: [],
    calls: [],
    fail: false,
    readError: null,
  });
  render();
  return render();
}
function edit(label, value) {
  const field = find(render(), (n) => n.props?.label === label);
  assert.ok(field, label);
  field.props.onChange(value);
}
function field(label) {
  return find(render(), (n) => n.props?.label === label).props.value;
}
function save() {
  return find(render(), (n) => n.props?.onClick && n.props?.size === "lg").props.onClick();
}
const oldWindow = globalThis.window;
test.before(() => {
  globalThis.window = new EventTarget();
});
test.after(() => {
  globalThis.window = oldWindow;
});
test("phone and CNH drafts survive background profile refetches and file-picker focus changes", () => {
  mount();
  edit("Telefone", "31988888888");
  edit("Número da CNH", "10987654321");
  r.courier = { ...r.courier, telefone: "31999999999", cnh: "12345678901", lat: 10 };
  r.profile = { ...r.profile };
  render();
  assert.equal(field("Telefone"), "31988888888");
  assert.equal(field("Número da CNH"), "10987654321");
});
test("saving confirms a single atomic write and reopening loads the persisted phone and CNH", async () => {
  mount();
  edit("Telefone", "31988888888");
  edit("Número da CNH", "10987654321");
  await save();
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].name, "save_courier_registration");
  assert.deepEqual(r.calls[0].args.p_patch, { telefone: "31988888888", cnh: "10987654321" });
  assert.equal(r.calls[0].args.p_expected.cnh, "12345678901");
  assert.ok(r.notices.some((n) => n.kind === "success"));
  const courier = r.persistedDriver,
    profile = r.persistedProfile;
  r.states = [];
  r.effects = [];
  r.courier = structuredClone(courier);
  r.profile = structuredClone(profile);
  render();
  render();
  assert.equal(field("Telefone"), "31988888888");
  assert.equal(field("Número da CNH"), "10987654321");
});
test("a failed save keeps the draft and never announces success", async () => {
  mount();
  edit("Número da CNH", "10987654321");
  r.fail = true;
  await save();
  r.courier = { ...initialDriver };
  render();
  assert.equal(field("Número da CNH"), "10987654321");
  assert.equal(
    r.notices.some((n) => n.kind === "success"),
    false,
  );
  assert.ok(r.notices.some((n) => n.kind === "error"));
});
test("read errors show retry rather than an empty registration form", () => {
  mount();
  r.readError = Error("offline");
  const tree = render();
  assert.ok(find(tree, (n) => n.props?.role === "alert"));
  assert.equal(
    find(tree, (n) => n.props?.label === "Telefone"),
    undefined,
  );
});
test("partial registration changes preserve unedited payment fields and original address properties", () => {
  const snapshot = {
    profile: r.profile,
    courier: {
      ...initialDriver,
      endereco: { rua: "Rua", cidade: "Cidade", lat: -20 },
      pix_key: "existing",
    },
  };
  const change = registrationChanges(
    { telefone: "31988888888", pix_key: "existing", rua: "Rua nova", cidade: "Cidade" },
    { telefone: "31999999999", pix_key: "existing", rua: "Rua", cidade: "Cidade" },
    snapshot,
  );
  assert.equal(change.patch.pix_key, undefined);
  assert.equal(change.patch.endereco.lat, -20);
  assert.equal(change.patch.endereco.rua, "Rua nova");
});
