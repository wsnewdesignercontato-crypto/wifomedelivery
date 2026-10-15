import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateBrevoSettings } from "./brevo-config";
import type { BrevoStatus } from "./brevo-config";
import type { BrevoCredentials } from "./brevo-hook.server";

const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ context, next }) => {
    // Verify the account still exists; signed JWT claims alone survive signout/deletion.
    const { data, error } = await context.supabase.auth.getUser();
    if (error || !data.user || data.user.id !== context.userId || !data.user.email_confirmed_at) {
      throw new Error("Unauthorized");
    }
    const role = await context.supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
    if (role.error || role.data !== true) throw new Error("Forbidden");
    return next({ context: { adminEmail: data.user.email } });
  });

async function readStatus(): Promise<BrevoStatus> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("brevo_settings_get");
  if (error || !data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Configuração de e-mails indisponível.");
  const status = data as Record<string, unknown>;
  // Explicit DTO: never serialize the credentials RPC result or a database row.
  return {
    senderName: typeof status.senderName === "string" ? status.senderName : "PedeTrem",
    senderEmail: typeof status.senderEmail === "string" ? status.senderEmail : "",
    configured: status.configured === true,
    tested: status.tested === true,
    testedAt: typeof status.testedAt === "string" ? status.testedAt : null,
    authHookReady:
      process.env.AUTH_EMAIL_HOOK_ENABLED === "true" && !!process.env.AUTH_EMAIL_HOOK_SECRET,
  };
}

export const getBrevoSettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    try {
      return await readStatus();
    } catch {
      throw new Error("Configuração de e-mails indisponível.");
    }
  });

export const saveBrevoSettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(validateBrevoSettings)
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.rpc("brevo_settings_save", {
        _sender_name: data.senderName,
        _sender_email: data.senderEmail,
        _api_key: data.apiKey ?? null,
      });
      if (error) throw new Error();
      return await readStatus();
    } catch {
      throw new Error("Não foi possível salvar a configuração de e-mails.");
    }
  });

export const testBrevoConnection = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    if (!context.adminEmail)
      throw new Error("Sua conta precisa de um e-mail confirmado para receber o teste.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const reserved = await supabaseAdmin.rpc("brevo_test_reserve");
    if (reserved.error?.code === "P0002")
      throw new Error("Aguarde 60 segundos entre os testes de envio.");
    if (
      reserved.error ||
      !reserved.data ||
      typeof reserved.data !== "object" ||
      Array.isArray(reserved.data)
    ) {
      throw new Error("Salve a chave API e o remetente antes de enviar o teste.");
    }
    const config = reserved.data as unknown as BrevoCredentials;
    if (!config.apiKey || !config.revision)
      throw new Error("Configure a chave API antes de testar.");
    const { sendBrevoEmail } = await import("./brevo-email.server");
    try {
      await sendBrevoEmail(config.apiKey, {
        sender: { name: config.senderName, email: config.senderEmail },
        to: [{ email: context.adminEmail }],
        subject: "Teste da integração Brevo — PedeTrem",
        htmlContent:
          "<p>O envio de teste da integração Brevo foi solicitado pelo administrador do PedeTrem.</p>",
        textContent:
          "O envio de teste da integração Brevo foi solicitado pelo administrador do PedeTrem.",
      });
    } catch (error) {
      await supabaseAdmin.rpc("brevo_test_complete", {
        _revision: config.revision,
        _success: false,
      });
      // The provider helper returns sanitized errors only.
      throw error instanceof Error
        ? error
        : new Error("Não foi possível confirmar o envio de teste.");
    }
    const result = await supabaseAdmin.rpc("brevo_test_complete", {
      _revision: config.revision,
      _success: true,
    });
    if (result.error)
      throw new Error(
        "O teste foi aceito pela Brevo, mas não foi possível registrar o resultado. Confira sua caixa de e-mail.",
      );
    return {
      status: await readStatus(),
      message:
        "A Brevo aceitou o envio. Confira a caixa de entrada e o spam do seu e-mail de administrador.",
    };
  });
