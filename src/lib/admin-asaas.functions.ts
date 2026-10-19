import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateAsaasEnvironment, validateAsaasSettings } from "./asaas-config";
import type { AsaasEnvironment, AsaasStatus } from "./asaas-config";
import { resolveAppUrl } from "./app-url";

const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ context, next }) => {
    const { data, error } = await context.supabase.auth.getUser();
    if (error || !data.user || data.user.id !== context.userId || !data.user.email_confirmed_at)
      throw new Error("Unauthorized");
    const role = await context.supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
    if (role.error || role.data !== true) throw new Error("Forbidden");
    return next();
  });

async function readStatus(environment: AsaasEnvironment): Promise<AsaasStatus> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("asaas_settings_get", {
    _environment: environment,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Configuração da Asaas indisponível.");
  const row = data as Record<string, unknown>;
  if (row.environment !== environment || typeof row.revision !== "string")
    throw new Error("Configuração da Asaas indisponível.");
  const appUrl = resolveAppUrl({ appUrl: process.env.APP_URL, vercelUrl: process.env.VERCEL_URL });
  // Explicit DTO. No credential RPC or raw database object is returned to the browser.
  return {
    environment,
    notificationEmail: typeof row.notificationEmail === "string" ? row.notificationEmail : "",
    configured: row.configured === true,
    tested: row.tested === true,
    testedAt: typeof row.testedAt === "string" ? row.testedAt : null,
    webhookConfigured: row.webhookConfigured === true,
    webhookId: typeof row.webhookId === "string" ? row.webhookId : null,
    lastWebhookAt: typeof row.lastWebhookAt === "string" ? row.lastWebhookAt : null,
    revision: row.revision,
    webhookUrl: `${appUrl}/api/payments/asaas/webhook?environment=${environment}`,
  };
}

export const getAsaasSettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(validateAsaasEnvironment)
  .handler(async ({ data }) => readStatus(data.environment));

export const saveAsaasSettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(validateAsaasSettings)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getAsaasCredentials } = await import("./asaas-storage.server");
    const { randomBytes } = await import("node:crypto");
    const existing = await getAsaasCredentials(data.environment);
    if (!data.apiKey && !existing.apiKey)
      throw new Error("Informe a chave API deste ambiente antes de salvar.");
    const token =
      data.webhookToken ?? (existing.webhookToken ? undefined : randomBytes(32).toString("hex"));
    const { error } = await supabaseAdmin.rpc("asaas_settings_save", {
      _environment: data.environment,
      _notification_email: data.notificationEmail,
      _api_key: data.apiKey,
      _webhook_token: token,
    });
    if (error) throw new Error("Não foi possível salvar a configuração da Asaas.");
    return readStatus(data.environment);
  });

export const testAsaasConnection = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(validateAsaasEnvironment)
  .handler(async ({ data }) => {
    const { getAsaasCredentials } = await import("./asaas-storage.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { testAsaasCredentials } = await import("./asaas-api.server");
    const credentials = await getAsaasCredentials(data.environment);
    try {
      await testAsaasCredentials(credentials);
    } catch (error) {
      await supabaseAdmin.rpc("asaas_connection_complete", {
        _environment: data.environment,
        _revision: credentials.revision,
        _success: false,
      });
      throw error;
    }
    const result = await supabaseAdmin.rpc("asaas_connection_complete", {
      _environment: data.environment,
      _revision: credentials.revision,
      _success: true,
    });
    if (result.error || result.data !== true)
      throw new Error("A configuração mudou durante o teste. Atualize e teste novamente.");
    return {
      status: await readStatus(data.environment),
      message: "Conexão com a Asaas confirmada. Nenhuma cobrança foi criada.",
    };
  });

export const registerAsaasWebhook = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(validateAsaasEnvironment)
  .handler(async ({ data }) => {
    const { getAsaasCredentials } = await import("./asaas-storage.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureAsaasWebhook } = await import("./asaas-api.server");
    // The shared lease also blocks credential rotation until the remote write completes.
    const lease = await supabaseAdmin.rpc("asaas_operation_acquire", {
      _environment: data.environment,
    });
    if (lease.error || typeof lease.data !== "string")
      throw new Error(
        "Já existe uma configuração da Asaas em andamento. Aguarde e tente novamente.",
      );
    const deadline = AbortSignal.timeout(25000);
    try {
      const credentials = await getAsaasCredentials(data.environment);
      const status = await readStatus(data.environment);
      const id = await ensureAsaasWebhook(credentials, status.webhookUrl, { signal: deadline });
      const result = await supabaseAdmin.rpc("asaas_webhook_complete", {
        _environment: data.environment,
        _revision: credentials.revision,
        _webhook_id: id,
        _payment_contract: 1,
      });
      if (result.error || result.data !== true)
        throw new Error("A configuração mudou durante o registro. Atualize e registre novamente.");
      return {
        status: await readStatus(data.environment),
        message: "Webhook registrado na Asaas. O painel mostrará quando receber um evento.",
      };
    } finally {
      await supabaseAdmin.rpc("asaas_operation_release", {
        _environment: data.environment,
        _operation_id: lease.data,
      });
    }
  });
