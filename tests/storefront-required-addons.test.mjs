import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const product = {
  id: "product",
  nome: "Lanche",
  descricao: null,
  foto_url: null,
  fotos_adicionais: [],
  preco_cents: 1000,
  preco_promo_cents: null,
  disponivel: true,
  menu_category_id: null,
  destaque: true,
};
const store = {
  id: "store",
  nome: "Loja",
  descricao: null,
  logo_url: null,
  capa_url: null,
  taxa_entrega_cents: 500,
  tempo_medio_min: null,
  pedido_minimo_cents: 0,
  avaliacao: null,
  is_open: true,
  cidade: "Joinville",
};
const runtime = {
  states: [],
  stateIndex: 0,
  refs: [],
  refIndex: 0,
  inserts: [],
  groupResult: null,
  addonResult: null,
};
globalThis.__storefront = runtime;
const reactUrl = import.meta.resolve("react");
const jsx = loadTsx();
const hooks = registerHooks({
  resolve(name, context, next) {
    let source;
    if (name === "react" && context.parentURL?.includes("cliente.estabelecimento.$id.tsx"))
      source = `export * from ${JSON.stringify(reactUrl)};export const useEffect=()=>{};export const useMemo=fn=>fn();export const useRef=initial=>{const r=globalThis.__storefront;return r.refs[r.refIndex++]??={current:initial}};export const useState=initial=>{const r=globalThis.__storefront;const i=r.stateIndex++;if(!(i in r.states))r.states[i]=initial;return [r.states[i],next=>{r.states[i]=typeof next==="function"?next(r.states[i]):next}];};`;
    if (name === "@tanstack/react-router")
      source =
        'export const createFileRoute=()=>options=>({...options,useRouteContext:()=>({user:{id:"customer"}}),useParams:()=>({id:"store"})});export const useNavigate=()=>()=>{};';
    if (name === "@/components/reviews")
      source = "export const EstabReviewsPanel=()=>null;export const ReviewForm=()=>null;";
    if (name === "@/components/ui/dialog")
      source = `import React from ${JSON.stringify(reactUrl)};const Part=({children})=>React.createElement("div",null,children);export const Dialog=Part,DialogContent=Part,DialogHeader=Part,DialogTitle=Part;`;
    if (name === "@/integrations/supabase/client")
      source = `export const supabase={from(table){const r=globalThis.__storefront;let operation="read",columns="";const query={select(value){columns=value;return this},eq(){return this},in(){return this},limit(){return this},order(){return table==="product_addon_groups"?r.groupResult:r.addonResult},maybeSingle(){return this},single(){return this},update(data){operation="update";r.updates.push(data);return this},delete(){operation="delete";return this},insert(data){operation="insert";r.inserts.push(data);return this},then(resolve,reject){const result=operation!=="read"?(r.writeResult??{data:{id:"cart-row"},error:null}):(columns.includes("quantidade")?r.sameResult:r.cartResult);return Promise.resolve(result).then(resolve,reject)}};return query}};`;
    if (name === "sonner")
      source =
        "export const toast={success:(...args)=>globalThis.__storefront.notices.push(args),error:(message)=>globalThis.__storefront.errors.push(message)};";
    if (source)
      return { url: "data:text/javascript," + encodeURIComponent(source), shortCircuit: true };
    return next(name, context);
  },
});
const { Route } = await import("../src/routes/_authenticated/cliente.estabelecimento.$id.tsx");
hooks.deregister();
jsx.deregister();
test.after(() => delete globalThis.__storefront);
function reset() {
  runtime.states = [store, 0, [], [product], "", {}, false, false, null];
  runtime.refs = [];
  runtime.inserts = [];
  runtime.updates = [];
  runtime.notices = [];
  runtime.errors = [];
  runtime.cartResult = { data: [], error: null };
  runtime.sameResult = { data: [], error: null };
  runtime.writeResult = undefined;
  runtime.groupResult = { data: [], error: null };
  runtime.addonResult = { data: [], error: null };
}
function render() {
  runtime.stateIndex = 0;
  runtime.refIndex = 0;
  return Route.component();
}
function elements(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}
function addButton(tree) {
  return elements(tree).find((node) => node.props?.onClick?.name === "adicionar");
}
async function openProduct() {
  const tree = render();
  const button = elements(tree).find(
    (node) => node.props?.p?.id === "product" && node.props.onClick,
  );
  assert.ok(button, "product entry is rendered");
  return button.props.onClick();
}

test("adding while required addon groups are still loading never writes a bare cart item", async () => {
  reset();
  let release;
  runtime.groupResult = new Promise((resolve) => {
    release = resolve;
  });
  const opening = openProduct();
  const add = addButton(render());
  assert.ok(add.props.disabled, "adding stays disabled until requirements are known");
  await add.props.onClick();
  assert.equal(runtime.inserts.length, 0);
  release({ data: [], error: null });
  await opening;
});
test("a failed addon requirements query blocks adding and offers retry", async () => {
  reset();
  runtime.groupResult = { data: null, error: { message: "network failure" } };
  await openProduct();
  const tree = render();
  assert.ok(addButton(tree).props.disabled);
  await addButton(tree).props.onClick();
  assert.equal(runtime.inserts.length, 0);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /carregar os adicionais/);
  assert.match(html, /Tentar novamente/);
});
test("a required group without active options stays blocked with an unavailable explanation", async () => {
  reset();
  runtime.groupResult = {
    data: [
      {
        ordem: 0,
        addon_group_id: "required",
        addon_groups: {
          id: "required",
          nome: "Ponto da carne",
          descricao: null,
          minimo: 1,
          maximo: 1,
          obrigatorio: true,
          selecao_multipla: false,
          ordem: 0,
          ativo: true,
        },
      },
    ],
    error: null,
  };
  await openProduct();
  const tree = render();
  assert.ok(addButton(tree).props.disabled);
  await addButton(tree).props.onClick();
  assert.equal(runtime.inserts.length, 0);
  assert.match(renderToStaticMarkup(tree), /indisponíveis/);
});
test("a completed query with no addon requirements still allows the normal item", async () => {
  reset();
  await openProduct();
  const add = addButton(render());
  assert.ok(!add.props.disabled);
  await add.props.onClick();
  assert.equal(runtime.inserts.length, 1);
  assert.equal(runtime.inserts[0].product_id, "product");
  assert.deepEqual(runtime.inserts[0].addons, []);
  assert.equal(runtime.notices.length, 1);
  const [message, options] = runtime.notices[0];
  assert.equal(message, "Item adicionado ao carrinho");
  assert.match(options.description, /Lanche/);
  assert.equal(options.action.label, "OK");
  assert.match(options.className, /rounded-2xl/);
});

test("a rejected cart write keeps the product open and never confirms success", async () => {
  reset();
  runtime.writeResult = { data: null, error: { message: "database unavailable" } };
  await openProduct();
  await addButton(render()).props.onClick();
  assert.equal(runtime.notices.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.ok(!addButton(render()).props.disabled, "retry becomes available");
});

test("a transport failure unlocks a deliberate retry without a false confirmation", async () => {
  reset();
  runtime.writeResult = {
    then(_resolve, reject) {
      return Promise.reject(new Error("offline")).catch(reject);
    },
  };
  await openProduct();
  await addButton(render()).props.onClick();
  assert.equal(runtime.notices.length, 0);
  runtime.writeResult = undefined;
  await addButton(render()).props.onClick();
  assert.equal(runtime.notices.length, 1);
});

test("a write without a persisted row cannot report success", async () => {
  reset();
  runtime.writeResult = { data: null, error: null };
  await openProduct();
  await addButton(render()).props.onClick();
  assert.equal(runtime.notices.length, 0);
  assert.equal(runtime.errors.length, 1);
});

test("rapid taps cannot persist the same cart addition twice", async () => {
  reset();
  let release;
  runtime.writeResult = new Promise((resolve) => {
    release = resolve;
  });
  await openProduct();
  const add = addButton(render());
  const pending = add.props.onClick();
  await add.props.onClick();
  release({ data: { id: "cart-row" }, error: null });
  await pending;
  assert.equal(runtime.inserts.length, 1);
  assert.equal(runtime.notices.length, 1);
});

test("a failed cart lookup does not replace or add items", async () => {
  reset();
  runtime.cartResult = { data: null, error: { message: "offline" } };
  await openProduct();
  await addButton(render()).props.onClick();
  assert.equal(runtime.inserts.length, 0);
  assert.equal(runtime.notices.length, 0);
  assert.equal(runtime.errors.length, 1);
});

test("an ordinary item never merges into an item with instructions", async () => {
  reset();
  runtime.sameResult = {
    data: [{ id: "custom", quantidade: 2, addons: [], observacoes: "Sem cebola" }],
    error: null,
  };
  await openProduct();
  await addButton(render()).props.onClick();
  assert.equal(runtime.updates.length, 0);
  assert.equal(runtime.inserts.length, 1);
});

test("a failed quantity update does not show a success confirmation", async () => {
  reset();
  runtime.sameResult = {
    data: [{ id: "plain", quantidade: 2, addons: [], observacoes: null }],
    error: null,
  };
  runtime.writeResult = { data: null, error: { message: "update failed" } };
  await openProduct();
  await addButton(render()).props.onClick();
  assert.deepEqual(runtime.updates, [{ quantidade: 3 }]);
  assert.equal(runtime.inserts.length, 0);
  assert.equal(runtime.notices.length, 0);
});

test("a failed options query cannot bypass a required group", async () => {
  reset();
  runtime.groupResult = {
    data: [
      {
        ordem: 0,
        addon_group_id: "required",
        addon_groups: {
          id: "required",
          nome: "Ponto da carne",
          descricao: null,
          minimo: 1,
          maximo: 1,
          obrigatorio: true,
          selecao_multipla: false,
          ordem: 0,
          ativo: true,
        },
      },
    ],
    error: null,
  };
  runtime.addonResult = { data: null, error: { message: "network failure" } };
  await openProduct();
  const tree = render();
  assert.ok(addButton(tree).props.disabled);
  await addButton(tree).props.onClick();
  assert.equal(runtime.inserts.length, 0);
  assert.match(renderToStaticMarkup(tree), /Tentar novamente/);
});

test("choosing a loaded mandatory option enables adding and preserves the choice", async () => {
  reset();
  runtime.groupResult = {
    data: [
      {
        ordem: 0,
        addon_group_id: "required",
        addon_groups: {
          id: "required",
          nome: "Ponto da carne",
          descricao: null,
          minimo: 1,
          maximo: 1,
          obrigatorio: true,
          selecao_multipla: false,
          ordem: 0,
          ativo: true,
        },
      },
    ],
    error: null,
  };
  runtime.addonResult = {
    data: [
      {
        id: "option",
        nome: "Ao ponto",
        descricao: null,
        preco_extra_cents: 200,
        ordem: 0,
        addon_group_id: "required",
        ativo: true,
      },
    ],
    error: null,
  };
  await openProduct();
  const initial = render();
  assert.ok(addButton(initial).props.disabled);
  const group = elements(initial).find((node) => node.props?.g?.id === "required");
  group.props.toggleAddon(group.props.g, "option");
  const ready = render();
  assert.ok(!addButton(ready).props.disabled);
  await addButton(ready).props.onClick();
  assert.equal(runtime.inserts.length, 1);
  assert.deepEqual(runtime.inserts[0].addons, [
    {
      id: "option",
      nome: "Ao ponto",
      preco_extra_cents: 200,
      group_id: "required",
      group_nome: "Ponto da carne",
    },
  ]);
});
