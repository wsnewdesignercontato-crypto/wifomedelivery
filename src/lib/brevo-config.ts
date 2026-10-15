export type BrevoSettingsInput = {
  senderName: string;
  senderEmail: string;
  apiKey?: string;
};

export type BrevoStatus = {
  senderName: string;
  senderEmail: string;
  configured: boolean;
  tested: boolean;
  testedAt: string | null;
  authHookReady: boolean;
};

export function validEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@<>"\\]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)
  );
}

export function validateBrevoSettings(value: unknown): BrevoSettingsInput {
  if (!value || typeof value !== "object") throw new Error("Configuração inválida.");
  const input = value as Record<string, unknown>;
  const senderName = typeof input.senderName === "string" ? input.senderName.trim() : "";
  const senderEmail =
    typeof input.senderEmail === "string" ? input.senderEmail.trim().toLowerCase() : "";
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : undefined;
  if (
    !senderName ||
    senderName.length > 80 ||
    Array.from(senderName).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  ) {
    throw new Error("Informe um nome de remetente válido, com até 80 caracteres.");
  }
  if (!validEmail(senderEmail)) throw new Error("Informe um e-mail de remetente válido.");
  if (input.apiKey !== undefined && typeof input.apiKey !== "string")
    throw new Error("Chave API inválida.");
  if (
    apiKey &&
    (!apiKey.startsWith("xkeysib-") ||
      apiKey.length < 20 ||
      apiKey.length > 512 ||
      /\s/.test(apiKey))
  ) {
    throw new Error("Use uma chave API da Brevo. A chave SMTP não serve neste campo.");
  }
  return { senderName, senderEmail, apiKey: apiKey || undefined };
}
