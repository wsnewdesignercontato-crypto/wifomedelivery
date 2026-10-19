import { validEmail } from "./brevo-config.ts";
export type AsaasEnvironment = "sandbox" | "production";
export type AsaasSettingsInput = {
  environment: AsaasEnvironment;
  notificationEmail: string;
  apiKey?: string;
  webhookToken?: string;
};
export type AsaasStatus = {
  environment: AsaasEnvironment;
  notificationEmail: string;
  configured: boolean;
  tested: boolean;
  testedAt: string | null;
  webhookConfigured: boolean;
  webhookId: string | null;
  lastWebhookAt: string | null;
  revision: string;
  webhookUrl: string;
};
export function asaasEnvironment(value: unknown): AsaasEnvironment {
  if (value !== "sandbox" && value !== "production") throw new Error("Escolha Testes ou Produção.");
  return value;
}
export function validateAsaasEnvironment(value: unknown): { environment: AsaasEnvironment } {
  if (!value || typeof value !== "object") throw new Error("Configuração inválida.");
  return { environment: asaasEnvironment((value as Record<string, unknown>).environment) };
}
export function validateAsaasSettings(value: unknown): AsaasSettingsInput {
  const { environment } = validateAsaasEnvironment(value);
  const input = value as Record<string, unknown>;
  const notificationEmail =
    typeof input.notificationEmail === "string" ? input.notificationEmail.trim().toLowerCase() : "";
  if (!validEmail(notificationEmail))
    throw new Error("Informe um e-mail válido para os avisos da Asaas.");
  const secret = (field: "apiKey" | "webhookToken", min: number, max: number) => {
    if (input[field] !== undefined && typeof input[field] !== "string")
      throw new Error("Credencial inválida.");
    const text = typeof input[field] === "string" ? input[field].trim() : "";
    if (
      text &&
      (text.length < min ||
        text.length > max ||
        /\s/.test(text) ||
        Array.from(text).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
    )
      throw new Error("Confira o formato da credencial informada.");
    return text || undefined;
  };
  const apiKey = secret("apiKey", 20, 4096),
    webhookToken = secret("webhookToken", 32, 255);
  if (webhookToken && (webhookToken === apiKey || webhookToken.startsWith("$aact_")))
    throw new Error("Use um token de webhook diferente da chave API.");
  return { environment, notificationEmail, apiKey, webhookToken };
}
