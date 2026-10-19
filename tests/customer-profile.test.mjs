import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { loadTsx } from "./helpers/load-tsx.mjs";
import { missingCheckoutDetails } from "../src/lib/customer-access.ts";
import { notifyDataUpdated, PROFILE_UPDATED_EVENT } from "../src/lib/app-refresh.ts";

// Run the route's real load/save handlers; only React's lifecycle and the external
// database/notifications/navigation boundaries are supplied by this small harness.
const runtime = { states: [], cursor: 0, effects: [], notices: [], navigations: [] };
globalThis.__customerProfileTest = runtime;
const jsxHooks = loadTsx();
const reactUrl = import.meta.resolve("react");
const modules = {
  "@/lib/asaas-payment.functions": `export const getOnlinePaymentAvailability=async()=>({enabled:false,methods:[]});export const startOnlineOrder=async()=>{throw Error('online is disabled in profile regression')};`,
  "@/components/checkout/online-payment-form": `export const OnlinePaymentForm='form';`,
  react: `export * from ${JSON.stringify(reactUrl)};
    const r=globalThis.__customerProfileTest;
    export function useState(initial){const i=r.cursor++;if(!(i in r.states))r.states[i]=initial;return [r.states[i],v=>r.states[i]=typeof v==='function'?v(r.states[i]):v]}
    export function useEffect(fn){const i=r.cursor++;if(!(i in r.states)){r.states[i]=true;r.effects.push(fn)}}
    export function useRef(value){const i=r.cursor++;return r.states[i]??=( {current:value} )}
    export function useMemo(fn){return fn()}
    export function useReducer(reducer,initial){const [value,set]=useState(initial);return [value,event=>set(old=>reducer(old,event))]}`,
  "@tanstack/react-router": `const r=globalThis.__customerProfileTest;
    export const createFileRoute=()=>options=>({...options,useSearch:()=>({checkout:true,cupom:'VOLTA'}),useRouteContext:()=>({user:{id:'customer-test',email:'test@example.invalid'}})});
    export const useNavigate=()=>value=>r.navigations.push(value);
    export const Link='a';`,
  "@/integrations/supabase/client": `const r=globalThis.__customerProfileTest;export const supabase={rpc:async(...args)=>r.rpc ? r.rpc(...args) : ({data:{enabled:false},error:null}),from:(...args)=>globalThis.__customerProfileTest.from(...args)};`,
  sonner: `const r=globalThis.__customerProfileTest;export const toast={success:message=>r.notices.push({kind:'success',message}),error:message=>r.notices.push({kind:'error',message})};`,
  "@tanstack/react-start": "export const useServerFn=fn=>fn;",
  "@/lib/checkout.functions":
    "export const placeOrder=async()=>({});export const quoteOrder=async()=>({});",
};
const hooks = registerHooks({
  resolve(name, context, next) {
    if (
      name === "react" &&
      !/cliente\.(perfil\.(conta|enderecos)|checkout)\.tsx$/.test(context.parentURL ?? "")
    )
      return next(name, context);
    if (modules[name])
      return {
        url: "data:text/javascript," + encodeURIComponent(modules[name]),
        shortCircuit: true,
      };
    return next(name, context);
  },
});
const { Route } = await import("../src/routes/_authenticated/cliente.perfil.conta.tsx");
const { Route: AddressRoute } =
  await import("../src/routes/_authenticated/cliente.perfil.enderecos.tsx");
const { Route: CheckoutRoute } = await import("../src/routes/_authenticated/cliente.checkout.tsx");
hooks.deregister();
jsxHooks.deregister();

const initial = { id: "customer-test", nome: "Cliente", telefone: null, foto_url: null };

async function mount({
  readError = null,
  readData = initial,
  writeRows = 1,
  writeError = null,
  returnedPhone,
} = {}) {
  Object.assign(runtime, {
    states: [],
    cursor: 0,
    effects: [],
    notices: [],
    navigations: [],
    rpc: null,
  });
  let persisted = { ...initial };
  runtime.from = (table) => {
    assert.equal(table, "profiles");
    let update;
    const result = () =>
      update
        ? { data: writeRows ? persisted : null, error: writeError }
        : { data: readData, error: readError };
    const query = {
      select() {
        return query;
      },
      eq(column, value) {
        if (column === "id") assert.equal(value, "customer-test");
        return query;
      },
      is() {
        return query;
      },
      update(value) {
        update = value;
        if (writeRows && !writeError)
          persisted = {
            ...persisted,
            ...value,
            ...(returnedPhone !== undefined ? { telefone: returnedPhone } : {}),
          };
        return query;
      },
      maybeSingle() {
        return Promise.resolve(result());
      },
      single() {
        return Promise.resolve(result());
      },
      then(resolve, reject) {
        return Promise.resolve(result()).then(resolve, reject);
      },
    };
    return query;
  };
  render();
  for (const effect of runtime.effects.splice(0)) effect();
  await new Promise((resolve) => setImmediate(resolve));
  return () => persisted;
}

function render() {
  runtime.cursor = 0;
  return Route.component();
}
function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = find(child, predicate);
    if (found) return found;
  }
}
async function fillAndSavePhone() {
  find(render(), (node) => node.props?.id === "profile-phone").props.onChange({
    target: { value: "(31) 99999-9999" },
  });
  await find(render(), (node) => node.props?.children === "Salvar").props.onClick();
}

test("a zero-row profile update never reports saved or returns to checkout", async () => {
  await mount({ writeRows: 0 });
  await fillAndSavePhone();
  assert.equal(runtime.navigations.length, 0);
  assert.ok(runtime.notices.some((notice) => notice.kind === "error"));
  assert.ok(!runtime.notices.some((notice) => notice.kind === "success"));
});

test("a profile read failure is visible instead of presenting a form that silently cannot save", async () => {
  await mount({ readError: { message: "Falha de leitura" }, readData: null });
  assert.ok(runtime.notices.some((notice) => notice.kind === "error"));
  assert.ok(find(render(), (node) => node.props?.role === "alert"));
});

test("a missing profile is an actionable error instead of a Save button that does nothing", async () => {
  await mount({ readData: null });
  assert.ok(find(render(), (node) => node.props?.role === "alert"));
});

test("a saved phone persists before returning to checkout with the coupon", async () => {
  const persisted = await mount();
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  const savedPhonesAtRefresh = [];
  globalThis.window.addEventListener(PROFILE_UPDATED_EVENT, () =>
    savedPhonesAtRefresh.push(persisted().telefone),
  );
  try {
    await fillAndSavePhone();
    assert.equal(persisted().telefone, "(31) 99999-9999");
    assert.deepEqual(runtime.navigations, [
      { to: "/cliente/checkout", search: { cupom: "VOLTA" } },
    ]);
    assert.ok(runtime.notices.some((notice) => notice.kind === "success"));
    assert.deepEqual(savedPhonesAtRefresh, ["(31) 99999-9999"]);
    // The next checkout read uses persisted data, never the discarded form state.
    assert.deepEqual(
      missingCheckoutDetails(persisted().telefone, [{ rua: "Rua A", cidade: "BH" }]),
      [],
    );
  } finally {
    globalThis.window = previousWindow;
  }
});

test("checkout does not accept a save response whose persisted phone is still missing", async () => {
  await mount({ returnedPhone: null });
  await fillAndSavePhone();
  assert.equal(runtime.navigations.length, 0);
  assert.ok(runtime.notices.some((notice) => notice.kind === "error"));
});

test("a database update error keeps the customer on the form", async () => {
  await mount({ writeError: { message: "Sem permissão para salvar" } });
  await fillAndSavePhone();
  assert.equal(runtime.navigations.length, 0);
  assert.deepEqual(runtime.notices, [{ kind: "error", message: "Sem permissão para salvar" }]);
});

async function mountAddresses({
  readError = null,
  insertData = { id: "address-test", rua: "Rua A", cidade: "BH" },
  insertError = null,
  saved = [],
  deleteError = null,
  deleteData = { id: "address-test" },
} = {}) {
  Object.assign(runtime, {
    states: [],
    cursor: 0,
    effects: [],
    notices: [],
    navigations: [],
    rpc: null,
  });
  runtime.rpc = async () => ({ data: null, error: { message: "Sem permissão" } });
  runtime.from = (table) => {
    assert.equal(table, "addresses");
    let deleting = false;
    const query = {
      select() {
        return query;
      },
      eq() {
        return query;
      },
      order() {
        return Promise.resolve({ data: saved, error: readError });
      },
      delete() {
        deleting = true;
        return query;
      },
      insert() {
        return query;
      },
      single() {
        return Promise.resolve(
          deleting
            ? { data: deleteData, error: deleteError }
            : { data: insertData, error: insertError },
        );
      },
    };
    return query;
  };
  renderAddress();
  for (const effect of runtime.effects.splice(0)) effect();
  await new Promise((resolve) => setImmediate(resolve));
}
function renderAddress() {
  runtime.cursor = 0;
  return AddressRoute.component();
}
async function fillAndSaveAddress() {
  for (const [placeholder, value] of [
    ["Rua", "Rua A"],
    ["Cidade", "BH"],
  ])
    find(renderAddress(), (node) => node.props?.placeholder === placeholder).props.onChange({
      target: { value },
    });
  await find(
    renderAddress(),
    (node) => Array.isArray(node.props?.children) && node.props.children.includes(" Adicionar"),
  ).props.onClick();
}
test("a failed address load is visible instead of appearing as no saved addresses", async () => {
  await mountAddresses({ readError: { message: "Falha ao ler endereços" } });
  assert.ok(find(renderAddress(), (node) => node.props?.role === "alert"));
});
test("an insert without a saved address row never reports success or returns to checkout", async () => {
  await mountAddresses({ insertData: null });
  await fillAndSaveAddress();
  assert.equal(runtime.navigations.length, 0);
  assert.ok(runtime.notices.some((notice) => notice.kind === "error"));
});
test("a saved address returns to checkout and preserves the coupon", async () => {
  await mountAddresses();
  await fillAndSaveAddress();
  assert.deepEqual(runtime.navigations, [{ to: "/cliente/checkout", search: { cupom: "VOLTA" } }]);
});

for (const trigger of ["profile update", "visible", "pageshow", "online"]) {
  test(`an open checkout rechecks saved phone/address after ${trigger}`, async () => {
    Object.assign(runtime, {
      states: [],
      cursor: 0,
      effects: [],
      notices: [],
      navigations: [],
      rpc: null,
    });
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    globalThis.window = new EventTarget();
    globalThis.document = Object.assign(new EventTarget(), { visibilityState: "visible" });
    const refresh = () => {
      if (trigger === "profile update") notifyDataUpdated();
      else if (trigger === "visible")
        globalThis.document.dispatchEvent(new Event("visibilitychange"));
      else globalThis.window.dispatchEvent(new Event(trigger));
    };
    let savedPhone = null;
    const savedAddresses = [];
    runtime.from = (table) => {
      const result = () => ({
        data:
          table === "profiles"
            ? { telefone: savedPhone }
            : table === "addresses"
              ? savedAddresses.slice()
              : table === "cart_items"
                ? [{ id: "cart-test", establishment_id: "store-test", quantidade: 1 }]
                : { id: "store-test", nome: "Loja", taxa_entrega_cents: 0, pedido_minimo_cents: 0 },
        error: null,
      });
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        order() {
          return query;
        },
        single() {
          return Promise.resolve(result());
        },
        maybeSingle() {
          return Promise.resolve(result());
        },
        then(resolve, reject) {
          return Promise.resolve(result()).then(resolve, reject);
        },
      };
      return query;
    };
    const cleanups = [];
    const renderCheckout = () => {
      runtime.cursor = 0;
      return CheckoutRoute.component();
    };
    try {
      renderCheckout();
      for (const effect of runtime.effects.splice(0)) cleanups.push(effect());
      await new Promise((resolve) => setImmediate(resolve));
      savedPhone = "31999999999";
      refresh();
      await new Promise((resolve) => setImmediate(resolve));
      const phoneSaved = renderCheckout();
      assert.ok(!find(phoneSaved, (node) => node.props?.children === "Preencher telefone"));
      assert.ok(
        find(phoneSaved, (node) =>
          [node.props?.children]
            .flat()
            .includes("Cadastre seu endereço de entrega para concluir o pedido."),
        ),
        "The notice must ask only for the address when the phone is already saved",
      );
      savedAddresses.push({ id: "address-test", rua: "Rua A", cidade: "BH" });
      refresh();
      await new Promise((resolve) => setImmediate(resolve));
      const tree = renderCheckout();
      assert.ok(!find(tree, (node) => node.props?.children === "Preencher telefone"));
      assert.ok(!find(tree, (node) => node.props?.children === "Cadastrar endereço"));
    } finally {
      for (const cleanup of cleanups) if (typeof cleanup === "function") cleanup();
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
    }
  });
}

test("a rejected address removal keeps the saved address visible and emits no success", async () => {
  await mountAddresses({
    saved: [{ id: "address-test", rua: "Rua A", cidade: "BH", label: "Casa", is_default: true }],
    deleteError: { message: "Sem permissão" },
    deleteData: null,
  });
  await find(
    renderAddress(),
    (n) => n.props?.["aria-label"] === "Remover endereço",
  ).props.onClick();
  assert.ok(find(renderAddress(), (n) => n.props?.children?.includes?.("Casa")));
  assert.ok(runtime.notices.some((n) => n.kind === "error"));
  assert.ok(!runtime.notices.some((n) => n.kind === "success"));
});

test("a rejected atomic default change never changes the visible default", async () => {
  await mountAddresses({
    saved: [
      { id: "address-test", rua: "Rua A", cidade: "BH", label: "Trabalho", is_default: false },
    ],
  });
  await find(renderAddress(), (n) => n.props?.children === "Padrão").props.onClick();
  assert.ok(find(renderAddress(), (n) => n.props?.children === "Padrão"));
  assert.ok(runtime.notices.some((n) => n.kind === "error"));
  assert.ok(!runtime.notices.some((n) => n.kind === "success"));
});

test("a profile save writes only edited fields, preserving a photo saved in another app", async () => {
  await mount();
  let patch;
  const from = runtime.from;
  runtime.from = (table) => {
    const q = from(table),
      update = q.update;
    q.update = (v) => {
      patch = v;
      return update(v);
    };
    return q;
  };
  await fillAndSavePhone();
  assert.deepEqual(patch, { telefone: "(31) 99999-9999" });
});

test("a thrown network failure keeps the phone draft and releases the save button", async () => {
  await mount();
  const from = runtime.from;
  runtime.from = (table) => {
    const q = from(table);
    q.single = async () => {
      throw new Error("Offline");
    };
    return q;
  };
  await fillAndSavePhone();
  assert.equal(
    find(render(), (n) => n.props?.id === "profile-phone").props.value,
    "(31) 99999-9999",
  );
  assert.equal(find(render(), (n) => n.props?.children === "Salvar").props.disabled, false);
  assert.ok(!runtime.notices.some((n) => n.kind === "success"));
});

test("repeated taps while a save is pending produce only one write", async () => {
  await mount();
  find(render(), (n) => n.props?.id === "profile-phone").props.onChange({
    target: { value: "31988888888" },
  });
  const from = runtime.from;
  let release,
    writes = 0;
  runtime.from = (table) => {
    const q = from(table),
      single = q.single;
    q.single = () =>
      new Promise((resolve) => {
        writes++;
        release = () => resolve(single());
      });
    return q;
  };
  const save = find(render(), (n) => n.props?.children === "Salvar").props.onClick;
  const pending = save();
  await save();
  assert.equal(writes, 1);
  release();
  await pending;
  assert.equal(runtime.notices.filter((n) => n.kind === "success").length, 1);
});
