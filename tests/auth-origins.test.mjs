import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { buildAuthEmails } from "../src/lib/brevo-email.server.ts";

test("confirmation and recovery emails return to the correct independent app and refuse lookalike hosts", async () => {
  const hooks = registerHooks({
    resolve(name, context, next) {
      if (name === "./app-profiles")
        return {
          url: new URL("../src/lib/app-profiles.ts", import.meta.url).href,
          shortCircuit: true,
        };
      return next(name, context);
    },
  });
  try {
    const module = await import("../src/lib/auth-origins.ts").catch((error) => {
      if (error.code === "ERR_MODULE_NOT_FOUND") return null;
      throw error;
    });
    assert.ok(module, "The email hook needs a shared allowlist for the independent app origins");
    const allowed = module.authEmailOrigins("https://pedetrem.vercel.app");
    const sender = { name: "PedeTrem", email: "sender@example.com" };
    const payload = {
      user: { email: "recipient@example.com" },
      email_data: { email_action_type: "signup", token_hash: "verified-test-token" },
    };
    for (const origin of [
      "https://pedetrem.vercel.app",
      "https://pedetrem-loja.vercel.app",
      "https://pedetrem-entregador.vercel.app",
    ]) {
      for (const [action, path] of [
        ["signup", "/auth?confirmado=1"],
        ["recovery", "/redefinir-senha"],
      ]) {
        const redirect = origin + path;
        const [email] = buildAuthEmails(
          {
            ...payload,
            email_data: { ...payload.email_data, email_action_type: action, redirect_to: redirect },
          },
          sender,
          "https://nsvgfagjezdduatmbsqq.supabase.co",
          allowed,
        );
        const link = new URL(
          email.textContent.match(
            /https:\/\/nsvgfagjezdduatmbsqq\.supabase\.co\/auth\/v1\/verify\?\S+/,
          )[0],
        );
        assert.equal(link.searchParams.get("redirect_to"), redirect);
      }
    }
    assert.throws(
      () =>
        buildAuthEmails(
          {
            ...payload,
            email_data: {
              ...payload.email_data,
              redirect_to: "https://pedetrem-loja.vercel.app.evil.example/auth",
            },
          },
          sender,
          "https://nsvgfagjezdduatmbsqq.supabase.co",
          allowed,
        ),
      /Retorno de autenticação não permitido/,
    );
  } finally {
    hooks.deregister();
  }
});
