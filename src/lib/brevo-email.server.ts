import { validEmail } from "./brevo-config.ts";

export type BrevoEmail = {
  sender: { name: string; email: string };
  to: { email: string }[];
  subject: string;
  htmlContent: string;
  textContent?: string;
  headers?: Record<string, string>;
};

export type BrevoDeliveryResult = { messageId?: string; alreadyAccepted?: boolean };

export async function sendBrevoEmail(
  apiKey: string,
  message: BrevoEmail,
  options: { fetch?: typeof fetch; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<BrevoDeliveryResult> {
  if (!apiKey) throw new Error("Configure a chave API da Brevo antes de enviar.");
  try {
    const deadline = AbortSignal.timeout(options.timeoutMs ?? 6000);
    const response = await (options.fetch ?? fetch)("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(message),
      signal: options.signal ? AbortSignal.any([options.signal, deadline]) : deadline,
    });
    if (!response.ok) {
      // Provider bodies can include private details. Do not log or return them.
      if (
        response.status === 400 &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
          message.headers?.idempotencyKey ?? "",
        )
      ) {
        const errorBody = await response.json();
        // This code acknowledges an already accepted idempotency key, not a new send.
        if (errorBody?.code === "duplicate_parameter") return { alreadyAccepted: true };
      }
      if (response.status === 401 || response.status === 403) throw new Error("BREVO_AUTH");
      if (response.status === 429) throw new Error("BREVO_LIMIT");
      throw new Error("BREVO_UNAVAILABLE");
    }
    const result = await response.json();
    if (
      typeof result.messageId !== "string" ||
      !result.messageId ||
      result.messageId.length > 512
    ) {
      throw new Error("BREVO_UNAVAILABLE");
    }
    return { messageId: result.messageId };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "BREVO_AUTH")
      throw new Error(
        "A Brevo recusou a chave ou o acesso. Confira a chave API e a liberação da conta.",
      );
    if (code === "BREVO_LIMIT")
      throw new Error(
        "Limite de envio da Brevo atingido. Tente novamente após a liberação da cota.",
      );
    throw new Error(
      "A Brevo não confirmou o envio. Confira o remetente e os logs na sua conta antes de tentar novamente.",
    );
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Evento de e-mail inválido.");
  return value as Record<string, unknown>;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
}

export function buildAuthEmails(
  input: unknown,
  sender: BrevoEmail["sender"],
  supabaseUrl: string,
  allowedOrigins: string[],
): BrevoEmail[] {
  const payload = object(input);
  const user = object(payload.user);
  const data = object(payload.email_data);
  if (!validEmail(user.email)) throw new Error("Destinatário de autenticação inválido.");
  const titles: Record<string, string> = {
    signup: "Confirme seu cadastro",
    recovery: "Recupere sua senha",
    invite: "Seu convite para o PedeTrem",
    magiclink: "Seu link de acesso",
    email_change: "Confirme a alteração de e-mail",
    reauthentication: "Confirme sua identidade",
  };
  const action = typeof data.email_action_type === "string" ? data.email_action_type : "";
  const title = titles[action];
  if (!title) throw new Error("Tipo de e-mail de autenticação não suportado.");
  const origin = new URL(supabaseUrl);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/"
  ) {
    throw new Error("Origem de autenticação inválida.");
  }
  const redirect = new URL(
    typeof data.redirect_to === "string" && data.redirect_to
      ? data.redirect_to
      : allowedOrigins[0] + "/auth",
  );
  if (
    !allowedOrigins.includes(redirect.origin) ||
    redirect.username ||
    redirect.password ||
    !["https:", "http:"].includes(redirect.protocol)
  ) {
    throw new Error("Retorno de autenticação não permitido.");
  }
  const makeEmail = (email: string, hash: unknown): BrevoEmail => {
    if (!validEmail(email)) throw new Error("Destinatário de autenticação inválido.");
    let content: string;
    let text: string;
    if (action === "reauthentication") {
      if (typeof data.token !== "string" || !/^\d{6,10}$/.test(data.token))
        throw new Error("Código de autenticação inválido.");
      content = `<p>Seu código de confirmação é <strong>${data.token}</strong>.</p>`;
      text = `Seu código de confirmação é ${data.token}.`;
    } else {
      if (typeof hash !== "string" || !/^[a-zA-Z0-9_-]{1,256}$/.test(hash))
        throw new Error("Token de autenticação inválido.");
      const link = new URL("/auth/v1/verify", origin);
      link.searchParams.set("token", hash);
      link.searchParams.set("type", action);
      link.searchParams.set("redirect_to", redirect.href);
      content = `<p><a href="${escapeHtml(link.href)}">${escapeHtml(title)}</a></p>`;
      text = `${title}: ${link.href}`;
    }
    return {
      sender,
      to: [{ email }],
      subject: `${title} — ${sender.name}`,
      htmlContent: `<div><h1>${escapeHtml(sender.name)}</h1><h2>${escapeHtml(title)}</h2>${content}<p>Se você não solicitou esta ação, ignore este e-mail.</p></div>`,
      textContent: `${sender.name}\n${text}\nSe você não solicitou esta ação, ignore este e-mail.`,
    };
  };
  if (action === "email_change") {
    if (!validEmail(user.new_email)) throw new Error("Novo e-mail inválido.");
    const messages: BrevoEmail[] = [];
    if (data.token_hash_new) messages.push(makeEmail(user.email, data.token_hash_new));
    messages.push(makeEmail(user.new_email, data.token_hash));
    return messages;
  }
  return [makeEmail(user.email, data.token_hash)];
}
