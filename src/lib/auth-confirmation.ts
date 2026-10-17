import { z } from "zod";
import { safeReturnPath, type AppProfile } from "./customer-access.ts";

export const authEmailSchema = z
  .string()
  .trim()
  .email({ message: "Email inválido" })
  .max(255)
  .superRefine((email, context) => {
    const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
    const typo = /^(gmail|hotmail|outlook|live|yahoo)\.(coml|con|cmo)$/.exec(domain);
    if (typo)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Confira o domínio do e-mail: você quis dizer ${typo[1]}.com?`,
      });
  });

export function confirmationRedirectUrl(
  origin: string,
  profile: AppProfile,
  returnPath?: string | null,
): string {
  const url = new URL("/auth", origin);
  url.searchParams.set("perfil", profile);
  url.searchParams.set("confirmado", "1");
  const path = safeReturnPath(returnPath, profile);
  if (path) url.searchParams.set("redirect", path);
  return url.href;
}

type ResendAuth = {
  resend: (input: {
    type: "signup";
    email: string;
    options: { emailRedirectTo: string };
  }) => Promise<{ error: { message: string; status?: number; code?: string } | null }>;
};

export async function resendSignupConfirmation(
  auth: ResendAuth,
  email: string,
  origin: string,
  profile: AppProfile,
  returnPath?: string | null,
): Promise<void> {
  const { error } = await auth.resend({
    type: "signup",
    email: authEmailSchema.parse(email),
    options: { emailRedirectTo: confirmationRedirectUrl(origin, profile, returnPath) },
  });
  if (error) {
    if (
      error.status === 429 ||
      error.code === "over_email_send_rate_limit" ||
      error.code === "over_request_rate_limit"
    )
      throw new Error("Aguarde um pouco antes de solicitar outro e-mail de confirmação.");
    throw new Error(
      "Não foi possível solicitar a confirmação. Confira o e-mail e tente novamente.",
    );
  }
}
