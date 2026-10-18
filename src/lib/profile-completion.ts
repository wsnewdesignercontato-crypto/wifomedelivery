import { supabase } from "@/integrations/supabase/client";
import { notifyDataUpdated } from "./app-refresh";
import type { PerfilApp } from "./app-profiles";
export type ProfileCompletion = { complete: boolean; missing: string[]; redirect: string };
export async function confirmProfileSaved(
  userId: string,
  role: PerfilApp,
): Promise<ProfileCompletion> {
  // Only report completion using a fresh read of persisted data.
  const { data, error } = await supabase.rpc("check_profile_complete", {
    _user_id: userId,
    _role: role,
  });
  notifyDataUpdated();
  if (error || !data || typeof data !== "object" || Array.isArray(data))
    throw new Error(
      "Os dados foram gravados, mas não foi possível conferir o cadastro. Tente verificar novamente.",
    );
  const result = data as unknown as ProfileCompletion;
  if (typeof result.complete !== "boolean" || !Array.isArray(result.missing))
    throw new Error("Não foi possível conferir o cadastro salvo.");
  return result;
}
export function savedProfileMessage(result: ProfileCompletion): string {
  return result.complete
    ? "Dados salvos e cadastro completo!"
    : "Dados salvos. Ainda há campos obrigatórios para completar.";
}
