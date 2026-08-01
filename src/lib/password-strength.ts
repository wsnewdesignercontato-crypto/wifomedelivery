import { z } from "zod";

export type PasswordRule = {
  id: string;
  label: string;
  test: (v: string) => boolean;
};

export const passwordRules: PasswordRule[] = [
  { id: "len", label: "Pelo menos 8 caracteres", test: (v) => v.length >= 8 },
  { id: "upper", label: "Uma letra maiúscula", test: (v) => /[A-Z]/.test(v) },
  { id: "lower", label: "Uma letra minúscula", test: (v) => /[a-z]/.test(v) },
  { id: "num", label: "Um número", test: (v) => /\d/.test(v) },
  {
    id: "sym",
    label: "Um símbolo (!@#$...)",
    test: (v) => /[^A-Za-z0-9]/.test(v),
  },
];

/** Número mínimo de regras atendidas para aceitar a senha. */
export const MIN_RULES_OK = 4;

export function passwordScore(value: string) {
  return passwordRules.filter((r) => r.test(value)).length;
}

export function passwordStrengthLabel(score: number) {
  if (score <= 1) return { label: "Muito fraca", tone: "weak" as const };
  if (score === 2) return { label: "Fraca", tone: "weak" as const };
  if (score === 3) return { label: "Média", tone: "medium" as const };
  if (score === 4) return { label: "Forte", tone: "strong" as const };
  return { label: "Excelente", tone: "strong" as const };
}

export const senhaForteSchema = z
  .string()
  .max(72, { message: "A senha deve ter no máximo 72 caracteres" })
  .min(8, { message: "A senha deve ter pelo menos 8 caracteres" })
  .refine((v) => passwordScore(v) >= MIN_RULES_OK, {
    message:
      "Senha fraca: use maiúscula, minúscula, número e símbolo (mínimo 8 caracteres)",
  });
