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
  const copy: Record<string, { title: string; intro: string; button?: string; preheader: string }> =
    {
      signup: {
        title: "Falta só confirmar seu e-mail",
        intro:
          "Boas-vindas ao PedeTrem! Confirme seu endereço de e-mail para concluir o cadastro e começar a usar sua conta.",
        button: "Confirmar meu cadastro",
        preheader: "Confirme seu cadastro e venha para o PedeTrem.",
      },
      recovery: {
        title: "Vamos criar uma nova senha?",
        intro:
          "Recebemos uma solicitação para redefinir a senha da sua conta PedeTrem. Use o botão abaixo para escolher uma nova senha com segurança.",
        button: "Redefinir minha senha",
        preheader: "Seu link seguro para redefinir a senha do PedeTrem.",
      },
      invite: {
        title: "Você recebeu um convite",
        intro:
          "Você recebeu um convite para acessar o PedeTrem. Confirme seu e-mail para continuar a configuração da sua conta.",
        button: "Aceitar convite",
        preheader: "Seu convite para acessar o PedeTrem chegou.",
      },
      magiclink: {
        title: "Seu acesso ao PedeTrem",
        intro:
          "Use o botão abaixo para entrar na sua conta. Este link é pessoal: não compartilhe com outras pessoas.",
        button: "Entrar na minha conta",
        preheader: "Acesse sua conta PedeTrem com segurança.",
      },
      email_change: {
        title: "Confirme seu novo e-mail de acesso",
        intro:
          "Recebemos uma solicitação para alterar o e-mail da sua conta PedeTrem. Confirme esta alteração pelo botão abaixo. Por segurança, pode ser necessário confirmar tanto no endereço atual quanto no novo.",
        button: "Confirmar alteração de e-mail",
        preheader: "Confirme a alteração do e-mail da sua conta PedeTrem.",
      },
      reauthentication: {
        title: "Confirme sua identidade",
        intro:
          "Para continuar a alteração na sua conta PedeTrem, digite o código abaixo na tela que você abriu.",
        preheader: "Seu código de confirmação do PedeTrem.",
      },
      password_changed_notification: {
        title: "Sua senha foi alterada",
        intro:
          "A senha da sua conta PedeTrem foi alterada. Se foi você, está tudo certo e nenhuma ação adicional é necessária.",
        preheader: "Aviso de segurança: sua senha do PedeTrem foi alterada.",
      },
      email_changed_notification: {
        title: "Seu e-mail de acesso foi alterado",
        intro:
          "O endereço de e-mail usado para acessar sua conta PedeTrem foi alterado. Se foi você, nenhuma ação adicional é necessária.",
        preheader: "Aviso de segurança: o e-mail da sua conta PedeTrem foi alterado.",
      },
    };
  const action = typeof data.email_action_type === "string" ? data.email_action_type : "";
  const details = Object.hasOwn(copy, action) ? copy[action] : undefined;
  if (!details) throw new Error("Tipo de e-mail de autenticação não suportado.");
  const notification = action.endsWith("_notification");
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
    const appOrigin = new URL(allowedOrigins[0]).origin;
    const logo = escapeHtml(new URL("/assets/pedetrem-logo-circle.png", appOrigin).href);
    const title = escapeHtml(details.title);
    let content = "";
    let text = "";
    if (action === "reauthentication") {
      if (typeof data.token !== "string" || !/^\d{6,10}$/.test(data.token))
        throw new Error("Código de autenticação inválido.");
      content = `<p style="margin:24px 0;padding:20px 12px;background:#fff1f2;border:1px solid #fecdd3;border-radius:12px;text-align:center;font-size:30px;line-height:40px;font-weight:700;letter-spacing:6px;color:#991b1b;">${data.token}</p>`;
      text = `Seu código de confirmação é ${data.token}. Não compartilhe este código.`;
    } else if (!notification) {
      if (typeof hash !== "string" || !/^[a-zA-Z0-9_-]{1,256}$/.test(hash))
        throw new Error("Token de autenticação inválido.");
      const link = new URL("/auth/v1/verify", origin);
      link.searchParams.set("token", hash);
      link.searchParams.set("type", action);
      link.searchParams.set("redirect_to", redirect.href);
      const href = escapeHtml(link.href);
      content = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0;"><tr><td align="center"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#dc2626" style="border-radius:10px;text-align:center;mso-padding-alt:16px 28px;"><a href="${href}" target="_blank" style="display:inline-block;padding:16px 28px;border:1px solid #dc2626;border-radius:10px;color:#ffffff;font-size:16px;line-height:22px;font-weight:bold;text-decoration:none;">${escapeHtml(details.button!)}</a></td></tr></table></td></tr></table>
<p style="margin:0 0 10px;font-size:13px;line-height:20px;color:#6b7280;">Se o botão não abrir, copie e cole este link no navegador:</p>
<p style="margin:0 0 24px;font-size:12px;line-height:20px;word-break:break-all;overflow-wrap:anywhere;"><a href="${href}" style="color:#b91c1c;text-decoration:underline;">${href}</a></p>`;
      text = `${details.button}: ${link.href}`;
    }
    const safety = notification
      ? "Não reconhece esta alteração? Abra o PedeTrem diretamente, solicite a recuperação da sua conta e procure a Central de ajuda."
      : "Se você não solicitou esta ação, ignore este e-mail. Não compartilhe este link ou código. Caso tenha expirado, solicite um novo no PedeTrem.";
    return {
      sender,
      to: [{ email }],
      subject: `${details.title} — PedeTrem`,
      htmlContent: `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${title} — PedeTrem</title></head>
<body style="margin:0;padding:0;width:100%;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#202124;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(details.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f4f5f7"><tr><td align="center" style="padding:32px 12px;">
<!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;">
<tr><td height="6" bgcolor="#dc2626" style="font-size:0;line-height:6px;">&nbsp;</td></tr>
<tr><td align="center" style="padding:30px 24px 22px;"><img src="${logo}" alt="PedeTrem" width="88" height="88" style="display:block;width:88px;height:88px;border:0;border-radius:50%;"><p style="margin:14px 0 0;font-size:22px;line-height:28px;font-weight:bold;color:#991b1b;">PedeTrem</p><p style="margin:5px 0 0;font-size:11px;line-height:18px;letter-spacing:2px;color:#6b7280;">SUA CONTA, COM SEGURANÇA</p></td></tr>
<tr><td style="padding:10px 28px 30px;"><h1 style="margin:0 0 18px;font-size:27px;line-height:35px;font-weight:bold;color:#202124;">${title}</h1><p style="margin:0 0 20px;font-size:16px;line-height:26px;color:#4b5563;">${escapeHtml(details.intro)}</p>${content}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:16px 18px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;"><p style="margin:0;font-size:13px;line-height:21px;color:#6b7280;">${escapeHtml(safety)}</p></td></tr></table>
<p style="margin:24px 0 0;font-size:14px;line-height:22px;color:#4b5563;">Até já,<br><strong>Equipe PedeTrem</strong></p></td></tr>
<tr><td align="center" style="padding:20px 24px;border-top:1px solid #e5e7eb;background:#fafafa;"><p style="margin:0;font-size:12px;line-height:20px;color:#6b7280;">Mensagem automática de segurança da sua conta.<br>Enviada por ${escapeHtml(sender.name)}. Você não precisa responder.</p></td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`,
      textContent: `PedeTrem\n\n${details.title}\n\n${details.intro}\n\n${text}\n\n${safety}\n\nEquipe PedeTrem\nMensagem automática de segurança. Enviada por ${sender.name}.`,
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
