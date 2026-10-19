import { supabase } from "@/integrations/supabase/client";
import type { Courier } from "@/hooks/use-courier";
import type { Json } from "@/integrations/supabase/types";
import { z } from "zod";

export type RegistrationProfile = {
  id?: string;
  nome: string | null;
  telefone: string | null;
  foto_url: string | null;
};
export type RegistrationSnapshot = { profile: RegistrationProfile; courier: Courier | null };
const addressKeys = ["cep", "rua", "numero", "complemento", "bairro", "cidade", "estado"];
/** Send only edited fields. A stale form must never clear unrelated registration/payment data. */
export function registrationChanges(
  draft: Record<string, string>,
  baseline: Record<string, string>,
  snapshot: RegistrationSnapshot,
) {
  const patch: Record<string, Json> = {};
  const expected: Record<string, Json> = {};
  for (const [key, value] of Object.entries(draft)) {
    const inheritPhone =
      key === "telefone" && !snapshot.courier?.telefone?.trim() && !!value.trim();
    if (addressKeys.includes(key) || (value === baseline[key] && !inheritPhone)) continue;
    patch[key] = value.trim() || null;
    expected[key] =
      key === "nome"
        ? snapshot.profile.nome
        : key === "telefone"
          ? snapshot.courier?.telefone?.trim() || snapshot.profile.telefone
          : key === "foto_url"
            ? (snapshot.courier?.foto_url ?? snapshot.profile.foto_url)
            : ((snapshot.courier as unknown as Record<string, Json> | null)?.[key] ?? null);
  }
  if (
    draft.cidade !== undefined &&
    (draft.cidade !== baseline.cidade ||
      (!snapshot.courier?.cidade_atuacao?.trim() && !!draft.cidade.trim()))
  ) {
    patch.cidade_atuacao = draft.cidade.trim() || null;
    expected.cidade_atuacao = snapshot.courier?.cidade_atuacao ?? null;
  }
  if (addressKeys.some((key) => draft[key] !== undefined && draft[key] !== baseline[key])) {
    patch.endereco = {
      ...(snapshot.courier?.endereco ?? {}),
      ...Object.fromEntries(addressKeys.map((key) => [key, draft[key]?.trim() ?? ""])),
    } as Json;
    expected.endereco = (snapshot.courier?.endereco as Json) ?? null;
  }
  return { patch, expected };
}

const resultSchema = z.object({
  profile: z.object({
    id: z.string(),
    nome: z.string().nullable(),
    telefone: z.string().nullable(),
    foto_url: z.string().nullable(),
  }),
  courier: z.object({ user_id: z.string() }).passthrough(),
  completion: z.object({
    complete: z.boolean(),
    missing: z.array(z.string()),
    redirect: z.string(),
  }),
});
export async function saveCourierRegistration(
  userId: string,
  patch: Record<string, Json>,
  expected: Record<string, Json>,
) {
  const { data, error } = await supabase.rpc("save_courier_registration", {
    p_patch: patch,
    p_expected: expected,
  });
  if (error) throw new Error(error.message);
  const saved = resultSchema.parse(data);
  if (saved.profile.id !== userId || saved.courier.user_id !== userId)
    throw new Error("Não foi possível confirmar seu cadastro salvo.");
  return { ...saved, courier: saved.courier as unknown as Courier };
}
