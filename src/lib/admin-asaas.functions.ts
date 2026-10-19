import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateAsaasEnvironment, validateAsaasSettings } from "./asaas-config";
import type { AsaasEnvironment, AsaasStatus } from "./asaas-config";
import { resolveAppUrl } from "./app-url";
import { z } from "zod";

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

export const getAsaasOnlineStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { paymentRpc } = await import("./asaas-payment-store.server");
    return paymentRpc<{ enabled: boolean; requestedEnabled: boolean; canEnable: boolean }>(
      "asaas_online_status",
    );
  });
export const setAsaasOnlineEnabled = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => z.object({ enabled: z.boolean() }).strict().parse(input))
  .handler(async ({ data }) => {
    const { paymentRpc } = await import("./asaas-payment-store.server");
    await paymentRpc("asaas_online_set_enabled", { _enabled: data.enabled });
    return paymentRpc<{ enabled: boolean; requestedEnabled: boolean; canEnable: boolean }>(
      "asaas_online_status",
    );
  });
export const getAsaasPayments = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        before: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { paymentRpc } = await import("./asaas-payment-store.server");
    return paymentRpc<import("./asaas-payment-store.server").AdminPayments>(
      "asaas_payments_admin",
      { _before: data.before, _limit: data.limit },
    );
  });
export const reconcileAsaasOrder = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => z.object({ orderId: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { paymentStore, paymentContext } = await import("./asaas-payment-store.server");
    const { createPaymentService } = await import("./asaas-payment-service.server");
    const row = await supabaseAdmin
      .from("orders")
      .select("cliente_id")
      .eq("id", data.orderId)
      .single();
    if (row.error || !row.data?.cliente_id) throw new Error("Pedido indisponível.");
    const a = await paymentContext(row.data.cliente_id, data.orderId);
    if (!a) throw new Error("Ainda não há cobrança para conferir.");
    return createPaymentService(paymentStore).reconcilePayment(a);
  });
export const diagnoseAsaasSandbox = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { getAsaasCredentials } = await import("./asaas-storage.server");
    const { findOrCreateAsaasCustomer, createAsaasPayment, getAsaasPix } =
      await import("./asaas-payment-api.server");
    const { randomUUID } = await import("node:crypto");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const lease = await supabaseAdmin.rpc("asaas_operation_acquire", { _environment: "sandbox" });
    if (lease.error || typeof lease.data !== "string")
      throw new Error("Aguarde a operação de teste atual.");
    try {
      const credentials = await getAsaasCredentials("sandbox");
      if (!credentials.tested || !credentials.apiKey)
        throw new Error("Configure e teste a chave Sandbox primeiro.");
      const c = { ...credentials, apiKey: credentials.apiKey };
      const payer = {
        name: "PedeTrem TESTE SEM VALOR",
        cpfCnpj: "24971563792",
        email: "teste-pedetrem@example.invalid",
        phone: "47999999999",
      };
      const customerId = await findOrCreateAsaasCustomer(
        c,
        "diagnostic-user-" + context.userId,
        payer,
      );
      const payment = await createAsaasPayment(
        c,
        {
          customerId,
          externalReference: "diagnostic-" + randomUUID(),
          billingType: "PIX",
          valueCents: 1000,
        },
        payer,
        undefined,
        "",
      );
      return {
        paymentId: payment.id,
        state: payment.status,
        pix: await getAsaasPix(c, payment.id),
        message:
          "Somente Sandbox: cobrança fictícia de R$ 10,00. Nenhum pedido, estoque ou saldo real foi alterado.",
      };
    } catch {
      throw new Error(
        "Não foi possível gerar o Pix Sandbox. Confira a chave e as permissões do ambiente de testes.",
      );
    } finally {
      await supabaseAdmin.rpc("asaas_operation_release", {
        _environment: "sandbox",
        _operation_id: lease.data,
      });
    }
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
