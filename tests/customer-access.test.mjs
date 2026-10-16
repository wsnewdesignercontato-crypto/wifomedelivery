import test from "node:test";
import assert from "node:assert/strict";
import {
  isPublicCustomerPath,
  loginProfile,
  safeReturnPath,
  missingCheckoutDetails,
} from "../src/lib/customer-access.ts";

test("visitors can browse only public customer screens", () => {
  for (const path of [
    "/cliente",
    "/cliente/",
    "/cliente/buscar",
    "/cliente/novidades",
    "/cliente/estabelecimento/12345678-abcd-4000-8000-123456789abc",
  ])
    assert.ok(isPublicCustomerPath(path));
  for (const path of [
    "/cliente/checkout",
    "/cliente/carrinho",
    "/cliente/perfil",
    "/cliente/pedidos",
    "/cliente/pedido/123",
    "/admin",
    "/estabelecimento",
    "/entregador",
    "/cliente-extra",
  ])
    assert.ok(!isPublicCustomerPath(path));
});
test("protected areas preserve their own login profile", () => {
  assert.equal(loginProfile("/entregador/corridas"), "entregador");
  assert.equal(loginProfile("/estabelecimento/pedidos"), "estabelecimento");
  assert.equal(loginProfile("/cliente/checkout"), "cliente");
});
test("login returns only to an internal path for the intended profile", () => {
  assert.equal(
    safeReturnPath("/cliente/checkout?cupom=TESTE", "cliente"),
    "/cliente/checkout?cupom=TESTE",
  );
  for (const path of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/admin",
    "/entregador",
    "/cliente-evil",
    "/cliente/%0aevil",
  ])
    assert.equal(safeReturnPath(path, "cliente"), null);
});
test("phone and address are required for purchase, never inferred from a name or email", () => {
  assert.deepEqual(missingCheckoutDetails(null, []), ["telefone", "endereco"]);
  assert.deepEqual(
    missingCheckoutDetails("(31) 99999-9999", [{ rua: "Rua A", cidade: "Belo Horizonte" }]),
    [],
  );
  assert.deepEqual(missingCheckoutDetails("319", [{ rua: " ", cidade: "BH" }]), [
    "telefone",
    "endereco",
  ]);
});
