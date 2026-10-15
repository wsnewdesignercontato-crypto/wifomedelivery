import test from "node:test";
import assert from "node:assert/strict";
import { generateOperationsInsight } from "../src/lib/ai-gateway.server.ts";

const token = "isolated-gateway-test-token";
const summary = { periodo: "30 dias", total_pedidos: 10 };
const response = { choices: [{ message: { content: "Reduza os pedidos cancelados." } }] };
const oidcToken = (id) =>
  `${Buffer.from('{"alg":"RS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, jti: id })).toString("base64url")}.synthetic-test-signature`;

test("insights use the Vercel endpoint, configured model and aggregate metrics", async () => {
  const result = await generateOperationsInsight("Como melhorar?", summary, {
    token,
    model: "google/gemini-3-flash",
    fetch: async (url, init) => {
      assert.equal(url, "https://ai-gateway.vercel.sh/v1/chat/completions");
      assert.equal(init.method, "POST");
      assert.equal(init.headers.Authorization, `Bearer ${token}`);
      assert.ok(init.signal instanceof AbortSignal);
      const body = JSON.parse(init.body);
      assert.equal(body.model, "google/gemini-3-flash");
      assert.match(body.messages[0].content, /português/);
      assert.match(body.messages[1].content, /Como melhorar\?/);
      assert.match(body.messages[1].content, /total_pedidos/);
      return Response.json(response);
    },
  });
  assert.equal(result, "Reduza os pedidos cancelados.");
});

test("missing token returns a controlled message without a request", async () => {
  let requested = false;
  const result = await generateOperationsInsight("Pergunta", summary, {
    token: "",
    fetch: async () => {
      requested = true;
      return Response.json(response);
    },
  });
  assert.equal(requested, false);
  assert.match(result, /não configurada/);
});

for (const status of [401, 429, 500]) {
  test(`HTTP ${status} keeps provider errors and credentials private`, async () => {
    const result = await generateOperationsInsight("Pergunta", summary, {
      token,
      fetch: async () => Response.json({ error: `provider details ${token}` }, { status }),
    });
    assert.match(result, /indisponível/);
    assert.ok(!result.includes(token));
    assert.ok(!result.includes("provider details"));
  });
}

for (const content of [undefined, "", "   ", {}, 42]) {
  test(`unexpected content ${JSON.stringify(content)} returns a controlled message`, async () => {
    const result = await generateOperationsInsight("Pergunta", summary, {
      token,
      fetch: async () => Response.json({ choices: [{ message: { content } }] }),
    });
    assert.match(result, /resposta válida/);
  });
}

test("invalid JSON is contained", async () => {
  const result = await generateOperationsInsight("Pergunta", summary, {
    token,
    fetch: async () => new Response("not-json " + token),
  });
  assert.match(result, /indisponível/);
  assert.ok(!result.includes(token));
});

test("timeout and network failures do not expose credentials", async () => {
  const result = await generateOperationsInsight("Pergunta", summary, {
    token,
    fetch: async () => {
      throw new DOMException(`provider timeout ${token}`, "TimeoutError");
    },
  });
  assert.match(result, /indisponível/);
  assert.ok(!result.includes(token));
});

test("deployment OIDC and environment model are supported without an API key", async () => {
  const previous = Object.fromEntries(
    ["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN", "AI_GATEWAY_MODEL"].map((name) => [
      name,
      process.env[name],
    ]),
  );
  delete process.env.AI_GATEWAY_API_KEY;
  const localOidcToken = oidcToken("local");
  process.env.VERCEL_OIDC_TOKEN = localOidcToken;
  process.env.AI_GATEWAY_MODEL = "google/gemini-3-flash";
  try {
    assert.equal(
      await generateOperationsInsight("Pergunta", summary, {
        fetch: async (_, init) => {
          assert.equal(init.headers.Authorization, `Bearer ${localOidcToken}`);
          assert.equal(JSON.parse(init.body).model, process.env.AI_GATEWAY_MODEL);
          return Response.json(response);
        },
      }),
      "Reduza os pedidos cancelados.",
    );
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("runtime request context supplies OIDC without an environment token and refreshes each request", async () => {
  const symbol = Symbol.for("@vercel/request-context");
  const previousContext = globalThis[symbol];
  const previousKey = process.env.AI_GATEWAY_API_KEY;
  const previousOidc = process.env.VERCEL_OIDC_TOKEN;
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.VERCEL_OIDC_TOKEN;
  let requestToken = oidcToken("request-one");
  globalThis[symbol] = { get: () => ({ headers: { "x-vercel-oidc-token": requestToken } }) };
  try {
    for (const id of ["request-one", "request-two"]) {
      requestToken = oidcToken(id);
      assert.equal(
        await generateOperationsInsight("Pergunta", summary, {
          fetch: async (_, init) => {
            assert.equal(init.headers.Authorization, `Bearer ${requestToken}`);
            return Response.json(response);
          },
        }),
        "Reduza os pedidos cancelados.",
      );
      // A warm process may retain an old environment copy; the next request must win.
      process.env.VERCEL_OIDC_TOKEN = oidcToken("stale-environment");
    }
  } finally {
    if (previousContext === undefined) delete globalThis[symbol];
    else globalThis[symbol] = previousContext;
    if (previousKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = previousKey;
    if (previousOidc === undefined) delete process.env.VERCEL_OIDC_TOKEN;
    else process.env.VERCEL_OIDC_TOKEN = previousOidc;
  }
});

test("an explicit API key takes precedence without accessing request OIDC", async () => {
  const symbol = Symbol.for("@vercel/request-context");
  const previousContext = globalThis[symbol];
  globalThis[symbol] = {
    get: () => {
      throw new Error("OIDC must not be accessed");
    },
  };
  try {
    assert.equal(
      await generateOperationsInsight("Pergunta", summary, {
        token,
        fetch: async (_, init) => {
          assert.equal(init.headers.Authorization, `Bearer ${token}`);
          return Response.json(response);
        },
      }),
      "Reduza os pedidos cancelados.",
    );
  } finally {
    if (previousContext === undefined) delete globalThis[symbol];
    else globalThis[symbol] = previousContext;
  }
});
