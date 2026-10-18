import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { APP_PROFILES } from "../src/lib/app-profiles.ts";

const { authEmailSchema, confirmationRedirectUrl, resendSignupConfirmation } =
  await import("../src/lib/auth-confirmation.ts");

test("the observed gmail.coml typo is rejected before signup/resend; normal and custom domains remain valid", () => {
  assert.equal(authEmailSchema.safeParse("person@gmail.coml").success, false);
  assert.match(
    authEmailSchema.safeParse("person@gmail.coml").error.issues[0].message,
    /gmail\.com/,
  );
  for (const email of ["person@gmail.com", "person@hotmail.com", "person@empresa.com.br"])
    assert.equal(authEmailSchema.parse(` ${email} `), email);
});

test("resend uses the real Supabase Auth transport and returns confirmation to each independent app", async () => {
  for (const [profile, app] of Object.entries(APP_PROFILES)) {
    const calls = [];
    const client = createClient("https://nsvgfagjezdduatmbsqq.supabase.co", "sb_publishable_test", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (input, init) => {
          calls.push({ url: new URL(input), body: JSON.parse(init.body) });
          return Response.json({});
        },
      },
    });
    const path = `/${profile}/checkout`;
    await resendSignupConfirmation(client.auth, "person@gmail.com", app.origin, profile, path);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.pathname, "/auth/v1/resend");
    assert.equal(calls[0].body.type, "signup");
    assert.equal(calls[0].body.email, "person@gmail.com");
    const redirect = new URL(calls[0].url.searchParams.get("redirect_to"));
    assert.equal(redirect.origin, app.origin);
    assert.equal(redirect.searchParams.get("perfil"), profile);
    assert.equal(redirect.searchParams.get("confirmado"), "1");
    assert.equal(redirect.searchParams.get("redirect"), path);
    assert.equal(
      confirmationRedirectUrl(app.origin, profile, "https://evil.example"),
      `${app.origin}/auth?perfil=${profile}&confirmado=1`,
    );
  }
});

test("a denied resend never reports success or retries automatically", async () => {
  let calls = 0;
  await assert.rejects(
    resendSignupConfirmation(
      {
        resend: async () => {
          calls++;
          return {
            error: {
              message: "Email rate limit exceeded",
              status: 429,
              code: "over_email_send_rate_limit",
            },
          };
        },
      },
      "person@gmail.com",
      APP_PROFILES.cliente.origin,
      "cliente",
    ),
    /Aguarde/,
  );
  assert.equal(calls, 1);
});
