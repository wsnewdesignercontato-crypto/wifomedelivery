import test from "node:test";
import assert from "node:assert/strict";
import { validateBrevoSettings } from "../src/lib/brevo-config.ts";
import { sendBrevoEmail, buildAuthEmails } from "../src/lib/brevo-email.server.ts";

const apiKey = "xkeysib-" + "a".repeat(64);
const sender = { name: "PedeTrem", email: "sender@example.com" };
const settings = { senderName: sender.name, senderEmail: sender.email, apiKey };
const origins = ["https://wifomedelivery.vercel.app"];
const event = {
  user: { email: "client@example.com" },
  email_data: {
    email_action_type: "signup",
    token: "12345678",
    token_hash: "a".repeat(64),
    redirect_to: origins[0] + "/auth?confirmado=1",
  },
};

test("a duplicate error without an idempotency key is not accepted as success", async () => {
  await assert.rejects(
    sendBrevoEmail(
      apiKey,
      { sender, to: [{ email: "admin@example.com" }], subject: "Teste", htmlContent: "Teste" },
      { fetch: async () => Response.json({ code: "duplicate_parameter" }, { status: 400 }) },
    ),
  );
});

test("Brevo settings normalize the sender and keep blank key as unchanged", () => {
  assert.deepEqual(
    validateBrevoSettings({
      ...settings,
      senderName: " PedeTrem ",
      senderEmail: " SENDER@example.com ",
      apiKey: " ",
    }),
    { senderName: "PedeTrem", senderEmail: "sender@example.com", apiKey: undefined },
  );
});

for (const change of [
  { senderEmail: "bad\r\nBcc: victim@example.com" },
  { senderName: "bad\nname" },
  { apiKey: "smtp-key" },
  { senderName: "x".repeat(81) },
]) {
  test(
    "invalid sender or wrong key format is rejected without disclosing inputs " +
      Object.keys(change)[0],
    () => {
      assert.throws(
        () => validateBrevoSettings({ ...settings, ...change }),
        (error) => !error.message.includes(apiKey),
      );
    },
  );
}

test("the Brevo API receives the saved key, sender and email, with a deadline", async () => {
  const result = await sendBrevoEmail(
    apiKey,
    { sender, to: [{ email: "admin@example.com" }], subject: "Teste", htmlContent: "<p>Teste</p>" },
    {
      fetch: async (url, init) => {
        assert.equal(url, "https://api.brevo.com/v3/smtp/email");
        assert.equal(init.headers["api-key"], apiKey);
        assert.equal(init.method, "POST");
        assert.ok(init.signal instanceof AbortSignal);
        assert.equal(JSON.parse(init.body).to[0].email, "admin@example.com");
        return Response.json({ messageId: "test-provider-id" }, { status: 201 });
      },
    },
  );
  assert.equal(result.messageId, "test-provider-id");
});

for (const status of [401, 429, 500]) {
  test("provider failure is contained without leaking key or raw response " + status, async () => {
    await assert.rejects(
      sendBrevoEmail(
        apiKey,
        { sender, to: [{ email: "admin@example.com" }], subject: "Teste", htmlContent: "Teste" },
        {
          fetch: async () =>
            Response.json({ message: apiKey + " private-provider-details" }, { status }),
        },
      ),
      (error) =>
        !error.message.includes(apiKey) && !error.message.includes("private-provider-details"),
    );
  });
}

test("provider timeouts and malformed success responses do not report success", async () => {
  const message = {
    sender,
    to: [{ email: "admin@example.com" }],
    subject: "Teste",
    htmlContent: "Teste",
  };
  await assert.rejects(
    sendBrevoEmail(apiKey, message, {
      fetch: async () => {
        throw Error(apiKey);
      },
    }),
    (error) => !error.message.includes(apiKey),
  );
  await assert.rejects(
    sendBrevoEmail(apiKey, message, { fetch: async () => Response.json({ ok: true }) }),
  );
});

test("signup and recovery links verify tokens at the configured Supabase before returning to the app", () => {
  for (const type of ["signup", "recovery", "invite", "magiclink"]) {
    const emails = buildAuthEmails(
      { ...event, email_data: { ...event.email_data, email_action_type: type } },
      sender,
      "https://nsvgfagjezdduatmbsqq.supabase.co",
      origins,
    );
    assert.equal(emails.length, 1);
    const match = emails[0].htmlContent.match(/href="([^"]+)"/);
    const url = new URL(match[1].replaceAll("&amp;", "&"));
    assert.equal(url.origin, "https://nsvgfagjezdduatmbsqq.supabase.co");
    assert.equal(url.pathname, "/auth/v1/verify");
    assert.equal(url.searchParams.get("type"), type);
    assert.equal(url.searchParams.get("token"), "a".repeat(64));
    assert.equal(url.searchParams.get("redirect_to"), origins[0] + "/auth?confirmado=1");
  }
});

test("private auth tokens cannot be directed to an unrelated origin", () => {
  assert.throws(() =>
    buildAuthEmails(
      {
        ...event,
        email_data: { ...event.email_data, redirect_to: "https://attacker.example/auth" },
      },
      sender,
      "https://nsvgfagjezdduatmbsqq.supabase.co",
      origins,
    ),
  );
});

test("email changes use the documented reversed old/new token mapping", () => {
  const emails = buildAuthEmails(
    {
      user: { email: "old@example.com", new_email: "new@example.com" },
      email_data: {
        ...event.email_data,
        email_action_type: "email_change",
        token_hash: "new-hash",
        token_hash_new: "old-hash",
        token: "11111111",
        token_new: "22222222",
      },
    },
    sender,
    "https://nsvgfagjezdduatmbsqq.supabase.co",
    origins,
  );
  assert.equal(emails.length, 2);
  assert.equal(emails[0].to[0].email, "old@example.com");
  assert.ok(emails[0].htmlContent.includes("token=old-hash"));
  assert.equal(emails[1].to[0].email, "new@example.com");
  assert.ok(emails[1].htmlContent.includes("token=new-hash"));
});

test("sender display names are escaped and reauthentication uses an OTP without inventing a link", () => {
  const emails = buildAuthEmails(
    { ...event, email_data: { ...event.email_data, email_action_type: "reauthentication" } },
    { ...sender, name: "<img onerror='x'>" },
    "https://nsvgfagjezdduatmbsqq.supabase.co",
    origins,
  );
  assert.ok(!emails[0].htmlContent.includes("<img"));
  assert.ok(emails[0].htmlContent.includes("12345678"));
  assert.ok(!emails[0].htmlContent.includes("href="));
});
