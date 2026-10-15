import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { handleBrevoAuthHook } from "../src/lib/brevo-hook.server.ts";

const bytes = Buffer.alloc(32, 17);
const secret = "v1,whsec_" + bytes.toString("base64");
const data = {
  user: { email: "client@example.com" },
  email_data: {
    email_action_type: "recovery",
    token_hash: "a".repeat(64),
    redirect_to: "https://wifomedelivery.vercel.app/redefinir-senha",
  },
};
function signedRequest(payload = data, timestamp = Math.floor(Date.now() / 1000), signature) {
  const body = JSON.stringify(payload);
  const id = "test-auth-event";
  const sig =
    signature ?? createHmac("sha256", bytes).update(`${id}.${timestamp}.${body}`).digest("base64");
  return new Request("https://wifomedelivery.vercel.app/api/auth/send-email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": "v1," + sig,
    },
    body,
  });
}
function options(changes = {}) {
  return {
    secret,
    supabaseUrl: "https://nsvgfagjezdduatmbsqq.supabase.co",
    allowedOrigins: ["https://wifomedelivery.vercel.app"],
    getCredentials: async () => ({
      senderName: "PedeTrem",
      senderEmail: "sender@example.com",
      apiKey: "xkeysib-" + "a".repeat(64),
      tested: true,
    }),
    claim: async () => "claimed",
    complete: async () => {},
    send: async () => ({ messageId: "accepted-test" }),
    ...changes,
  };
}

test("valid signed Auth events send a recovery email with a stable idempotency key", async () => {
  const sent = [];
  const completed = [];
  const result = await handleBrevoAuthHook(
    signedRequest(),
    options({
      send: async (_, message) => {
        sent.push(message);
        return { messageId: "accepted" };
      },
      complete: async (id) => {
        completed.push(id);
      },
    }),
  );
  assert.equal(result.status, 200);
  assert.equal(sent[0].to[0].email, "client@example.com");
  assert.match(
    sent[0].headers.idempotencyKey,
    /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  );
  assert.equal(completed.length, 1);
});

test("a send accepted before a failed completion can be replayed and recorded without sending twice", async () => {
  let completed = false;
  let deliveries = 0;
  let providerKey;
  const simulatedProvider = async (_, init) => {
    const key = JSON.parse(init.body).headers.idempotencyKey;
    if (providerKey) {
      assert.equal(key, providerKey);
      return Response.json(
        { code: "duplicate_parameter", message: "private provider details" },
        { status: 400 },
      );
    }
    providerKey = key;
    deliveries++;
    return Response.json({ messageId: "accepted" }, { status: 201 });
  };
  const { sendBrevoEmail } = await import("../src/lib/brevo-email.server.ts");
  const opts = options({
    send: (key, email) => sendBrevoEmail(key, email, { fetch: simulatedProvider }),
    complete: async () => {
      if (!completed) {
        completed = true;
        throw Error("database connection lost");
      }
    },
  });
  assert.equal((await handleBrevoAuthHook(signedRequest(), opts)).status, 503);
  assert.equal((await handleBrevoAuthHook(signedRequest(), opts)).status, 200);
  assert.equal(deliveries, 1);
});

for (const request of [
  () => signedRequest(data, Math.floor(Date.now() / 1000), "forged"),
  () => signedRequest(data, Math.floor(Date.now() / 1000) - 1000),
]) {
  test("forged or expired hooks cannot reach credentials or the provider", async () => {
    let accessed = false;
    const result = await handleBrevoAuthHook(
      request(),
      options({
        getCredentials: async () => {
          accessed = true;
          throw Error();
        },
      }),
    );
    assert.equal(result.status, 401);
    assert.equal(accessed, false);
  });
}

test("missing signing setup fails closed without inspecting credentials", async () => {
  const result = await handleBrevoAuthHook(
    signedRequest(),
    options({
      secret: "",
      getCredentials: async () => {
        throw Error("must not be read");
      },
    }),
  );
  assert.equal(result.status, 503);
});

test("untested settings cannot activate authentication email sending", async () => {
  let sent = false;
  const result = await handleBrevoAuthHook(
    signedRequest(),
    options({
      getCredentials: async () => ({ apiKey: "private-key", tested: false }),
      send: async () => {
        sent = true;
      },
    }),
  );
  assert.equal(result.status, 503);
  assert.equal(sent, false);
  assert.ok(!(await result.text()).includes("private-key"));
});

test("an already sent delivery is acknowledged without a second provider request", async () => {
  let sent = false;
  const result = await handleBrevoAuthHook(
    signedRequest(),
    options({
      claim: async () => "sent",
      send: async () => {
        sent = true;
      },
    }),
  );
  assert.equal(result.status, 200);
  assert.equal(sent, false);
});

test("busy or failed deliveries return an error, never log or return token/provider details", async () => {
  const busy = await handleBrevoAuthHook(signedRequest(), options({ claim: async () => "busy" }));
  assert.equal(busy.status, 503);
  const failure = await handleBrevoAuthHook(
    signedRequest(),
    options({
      send: async () => {
        throw Error("private-provider-key " + data.email_data.token_hash);
      },
    }),
  );
  assert.equal(failure.status, 503);
  assert.ok(!(await failure.text()).includes("private-provider-key"));
});

test("oversized hook bodies are refused before credential access", async () => {
  const result = await handleBrevoAuthHook(
    signedRequest({ padding: "x".repeat(66000) }),
    options(),
  );
  assert.equal(result.status, 413);
});
