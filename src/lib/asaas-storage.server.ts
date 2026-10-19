import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AsaasCredentials } from "./asaas-api.server";
import type { AsaasEnvironment } from "./asaas-config";
import type { AsaasEvent } from "./asaas-webhook.server";
export async function getAsaasCredentials(
  environment: AsaasEnvironment,
): Promise<AsaasCredentials> {
  const { data, error } = await supabaseAdmin.rpc("asaas_credentials_get", {
    _environment: environment,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Configuração da Asaas indisponível.");
  const row = data as Record<string, unknown>;
  if (row.environment !== environment) throw new Error("Ambiente da Asaas indisponível.");
  return {
    environment,
    apiKey: typeof row.apiKey === "string" ? row.apiKey : null,
    webhookToken: typeof row.webhookToken === "string" ? row.webhookToken : null,
    notificationEmail: typeof row.notificationEmail === "string" ? row.notificationEmail : "",
    revision: typeof row.revision === "string" ? row.revision : "",
    tested: row.tested === true,
    webhookId: typeof row.webhookId === "string" ? row.webhookId : null,
  };
}
export async function recordAsaasEvent(event: AsaasEvent): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("asaas_webhook_record", {
    _environment: event.environment,
    _event_id: event.id,
    _event_type: event.event,
    _payment_id: event.paymentId ?? undefined,
    _payment_status: event.paymentStatus ?? undefined,
  });
  if (error || typeof data !== "boolean") throw new Error("Não foi possível registrar o evento.");
  return data;
}
export async function getAsaasWebhookCredentials(environment: AsaasEnvironment) {
  const { data, error } = await supabaseAdmin.rpc("asaas_webhook_tokens", {
    _environment: environment,
  });
  if (error || !Array.isArray(data)) throw new Error("Autenticação indisponível.");
  return {
    webhookToken: null,
    webhookTokens: data.filter(
      (value): value is string =>
        typeof value === "string" && value.length >= 32 && value.length <= 255,
    ),
  };
}
