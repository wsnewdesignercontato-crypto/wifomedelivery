import test from "node:test";
import assert from "node:assert/strict";
import { assertAppObservationOrigin } from "../src/lib/app-install-origin.ts";

const client = "https://pedetrem.vercel.app";
const request = (url, origin = client, other = {}) =>
  new Request(url, {
    method: "POST",
    headers: { ...(origin ? { Origin: origin } : {}), ...other },
  });
test("public observation requires the exact profile origin and actual request host", () => {
  assert.doesNotThrow(() =>
    assertAppObservationOrigin(request(client + "/_serverFn/x"), "cliente"),
  );
  assert.doesNotThrow(() =>
    assertAppObservationOrigin(request("http://pedetrem.vercel.app/_serverFn/x"), "cliente"),
  );
  assert.throws(
    () => assertAppObservationOrigin(request(client, "https://evil.example"), "cliente"),
    /origin/i,
  );
  assert.throws(() => assertAppObservationOrigin(request(client, null), "cliente"), /origin/i);
  assert.throws(() => assertAppObservationOrigin(request(client), "estabelecimento"), /origin/i);
  assert.throws(
    () =>
      assertAppObservationOrigin(
        request("https://evil.example", client, { "X-Forwarded-Host": "pedetrem.vercel.app" }),
        "cliente",
      ),
    /origin/i,
  );
  assert.doesNotThrow(() =>
    assertAppObservationOrigin(
      request("https://pedetrem-entregador.vercel.app", "https://pedetrem-entregador.vercel.app"),
      "entrega",
    ),
  );
});
