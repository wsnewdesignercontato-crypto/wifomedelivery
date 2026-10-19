import type { AsaasEnvironment } from "./asaas-config";
export type AsaasCredentials = {
  environment: AsaasEnvironment;
  notificationEmail: string;
  apiKey: string | null;
  webhookToken: string | null;
  revision: string;
  tested: boolean;
  webhookId: string | null;
};
type Options = { fetch?: typeof fetch; signal?: AbortSignal };
const origins = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
} as const;
export const ASAAS_PAYMENT_EVENTS = [
  "PAYMENT_CREATED",
  "PAYMENT_UPDATED",
  "PAYMENT_AWAITING_RISK_ANALYSIS",
  "PAYMENT_APPROVED_BY_RISK_ANALYSIS",
  "PAYMENT_REPROVED_BY_RISK_ANALYSIS",
  "PAYMENT_AUTHORIZED",
  "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_REFUND_IN_PROGRESS",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
  "PAYMENT_DELETED",
];
async function request(
  credentials: AsaasCredentials,
  path: string,
  method: "GET" | "POST" | "PUT",
  body: unknown,
  options: Options,
): Promise<Record<string, unknown>> {
  if (
    !credentials.apiKey ||
    (credentials.environment !== "sandbox" && credentials.environment !== "production")
  )
    throw new Error("Salve a chave API deste ambiente antes de testar.");
  try {
    const deadline = AbortSignal.timeout(8000);
    const response = await (options.fetch ?? fetch)(origins[credentials.environment] + path, {
      method,
      headers: {
        access_token: credentials.apiKey,
        "User-Agent": "PedeTrem/1.0",
        accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: options.signal ? AbortSignal.any([options.signal, deadline]) : deadline,
      redirect: "error",
    });
    if (!response.ok) {
      // Never relay provider descriptions: they can echo private input.
      const message =
        response.status === 401
          ? "A Asaas recusou a chave. Confira a chave e o ambiente escolhido."
          : response.status === 403
            ? "A Asaas não autorizou a operação. Confira as permissões da chave."
            : response.status === 429
              ? "A Asaas limitou as consultas. Aguarde e tente novamente."
              : "A Asaas não confirmou a operação. Confira a configuração e tente novamente.";
      throw new AsaasRequestError(message);
    }
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AsaasRequestError) throw error;
    throw new Error("Não foi possível conectar à Asaas. Tente novamente.");
  }
}
class AsaasRequestError extends Error {}
export async function testAsaasCredentials(
  credentials: AsaasCredentials,
  options: Options = {},
): Promise<void> {
  const result = await request(credentials, "/finance/balance", "GET", undefined, options);
  if (typeof result.balance !== "number" || !Number.isFinite(result.balance))
    throw new Error("A Asaas não confirmou uma resposta válida para o teste de conexão.");
}
export async function ensureAsaasWebhook(
  credentials: AsaasCredentials,
  callback: string,
  options: Options = {},
): Promise<string> {
  if (!credentials.tested || !credentials.webhookToken)
    throw new Error("Salve e teste a conexão antes de registrar o webhook.");
  const url = new URL(callback);
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw new Error("O webhook precisa de um endereço HTTPS público.");
  const listed = await request(credentials, "/webhooks?limit=100", "GET", undefined, options);
  if (!Array.isArray(listed.data)) throw new Error("A Asaas não confirmou a lista de webhooks.");
  const matching = listed.data.find(
    (item: unknown) =>
      item && typeof item === "object" && (item as Record<string, unknown>).url === url.href,
  ) as Record<string, unknown> | undefined;
  const id = matching?.id;
  if (id !== undefined && (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)))
    throw new Error("Identificador de webhook inválido.");
  const result = await request(
    credentials,
    id ? `/webhooks/${id}` : "/webhooks",
    id ? "PUT" : "POST",
    {
      name: `PedeTrem ${credentials.environment}`,
      url: url.href,
      email: credentials.notificationEmail,
      enabled: true,
      interrupted: false,
      authToken: credentials.webhookToken,
      events: ASAAS_PAYMENT_EVENTS,
      sendType: "SEQUENTIALLY",
      apiVersion: 3,
    },
    options,
  );
  if (typeof result.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(result.id))
    throw new Error("A Asaas não confirmou o registro do webhook.");
  return result.id;
}
