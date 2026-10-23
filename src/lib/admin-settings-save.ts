import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type SettingsUpdate = Omit<
  Database["public"]["Tables"]["platform_settings"]["Update"],
  "id" | "updated_by" | "updated_at"
>;

export async function persistPlatformSettings(values: SettingsUpdate) {
  const { data: session, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !session.user)
    throw new Error("Sua sessão expirou. Entre novamente para salvar.");
  const { data, error } = await supabase
    .from("platform_settings")
    .update({
      ...values,
      support_email: values.support_email?.trim() || null,
      support_whatsapp: values.support_whatsapp?.trim() || null,
      support_phone: values.support_phone?.trim() || null,
      updated_by: session.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1)
    .select("*")
    .single();
  if (error) {
    if (error.code === "42501")
      throw new Error(
        "Você não tem permissão para salvar as configurações. Entre com uma conta de administrador.",
      );
    if (error.code === "23514") {
      if (error.message.includes("support_email"))
        throw new Error("Confira o e-mail de suporte antes de salvar.");
      if (error.message.includes("support_whatsapp") || error.message.includes("support_phone"))
        throw new Error("Confira o telefone de suporte, incluindo país e DDD.");
    }
    throw new Error(
      "Não foi possível confirmar o salvamento. Atualize a página e tente novamente.",
    );
  }
  if (!data) throw new Error("Não foi possível confirmar o salvamento das configurações.");
  return data;
}
