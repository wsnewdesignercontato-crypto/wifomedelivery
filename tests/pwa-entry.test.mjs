import test from "node:test";
import assert from "node:assert/strict";
const module = await import("../src/lib/pwa-entry.ts").catch((error) => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return null;
  throw error;
});
test("old same-host entries redirect to the independent app before returning an installable document", () => {
  assert.ok(module);
  for (const [path, expected] of [
    [
      "/estabelecimento/entrar?confirmado=1",
      "https://pedetrem-loja.vercel.app/estabelecimento/entrar?confirmado=1",
    ],
    ["/entregador/entrar", "https://pedetrem-entregador.vercel.app/entregador/entrar"],
    [
      "/auth?perfil=estabelecimento&redirect=%2Festabelecimento",
      "https://pedetrem-loja.vercel.app/auth?perfil=estabelecimento&redirect=%2Festabelecimento",
    ],
    ["/entrega/entrar", "https://pedetrem-entregador.vercel.app/entregador/entrar"],
  ])
    assert.equal(
      module.independentAppRedirect(new Request("https://pedetrem.vercel.app" + path)),
      expected,
    );
});
test("correct origins, local development and API writes remain untouched", () => {
  assert.ok(module);
  for (const request of [
    new Request("https://pedetrem-loja.vercel.app/estabelecimento/entrar"),
    new Request("http://127.0.0.1:4174/estabelecimento/entrar"),
    new Request("https://preview.example/estabelecimento/entrar"),
    new Request("https://pedetrem.vercel.app/_serverFn/example"),
    new Request("https://pedetrem.vercel.app/estabelecimento", { method: "POST" }),
  ])
    assert.equal(module.independentAppRedirect(request), null);
});

test("routing stays isolated when the hosting proxy passes an internal HTTP URL", () => {
  assert.equal(
    module.independentAppRedirect(new Request("http://pedetrem.vercel.app/estabelecimento/entrar")),
    "https://pedetrem-loja.vercel.app/estabelecimento/entrar",
  );
  assert.equal(
    module.independentAppRedirect(
      new Request("http://pedetrem-loja.vercel.app/estabelecimento/entrar"),
    ),
    null,
  );
});
