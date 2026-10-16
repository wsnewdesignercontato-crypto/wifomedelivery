import test from "node:test";
import assert from "node:assert/strict";
import { defaultParseSearch } from "@tanstack/router-core";
import { authSearchSchema } from "../src/lib/auth-search.ts";

test("real confirmation links accept TanStack's numeric parsing and preserve the profile and return", () => {
  for (const profile of ["cliente", "estabelecimento", "entregador"]) {
    const search = defaultParseSearch(`?perfil=${profile}&confirmado=1&redirect=%2F${profile}`);
    assert.equal(search.confirmado, 1);
    const parsed = authSearchSchema.parse(search);
    assert.equal(parsed.confirmado, "1");
    assert.equal(parsed.perfil, profile);
    assert.equal(parsed.redirect, "/" + profile);
  }
});
test("quoted confirmation flags remain compatible without accepting arbitrary values as confirmation", () => {
  assert.equal(authSearchSchema.parse(defaultParseSearch("?confirmado=%221%22")).confirmado, "1");
  assert.equal(authSearchSchema.parse({}).confirmado, undefined);
  assert.equal(authSearchSchema.safeParse({ confirmado: { injected: true } }).success, false);
});
