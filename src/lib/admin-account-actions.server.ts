import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

export const accountActionSchema = z.object({
  targetUserId: z.string().uuid(),
  action: z.enum(["block", "unblock", "delete"]),
  confirmedEmail: z.string().trim().min(1).max(254),
});
export type AccountAction = z.infer<typeof accountActionSchema>;

// Called only after caller-scoped admin authorization in the server function.
// Injection keeps tests completely separate from real Auth accounts.
export async function applyAccountAction(
  admin: SupabaseClient<Database>,
  actorId: string,
  input: AccountAction,
) {
  const data = accountActionSchema.parse(input);
  if (data.targetUserId === actorId)
    throw new Error("Você não pode bloquear ou excluir sua própria conta.");
  const { data: target, error: targetError } = await admin.auth.admin.getUserById(
    data.targetUserId,
  );
  if (targetError || !target.user) throw new Error("Usuário não encontrado. Atualize a lista.");
  if (target.user.email?.toLowerCase() !== data.confirmedEmail.toLowerCase())
    throw new Error("O e-mail de confirmação não corresponde à conta selecionada.");
  const { data: roles, error: rolesError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.targetUserId);
  if (rolesError) throw new Error("Não foi possível conferir as permissões do usuário.");
  if (data.action !== "unblock" && roles?.some((r) => r.role === "admin"))
    throw new Error(
      "Remova primeiro o papel de administrador. Contas administrativas estão protegidas.",
    );
  const { error: auditError } = await admin.from("admin_audit_log").insert({
    admin_id: actorId,
    action: `account_${data.action}_requested`,
    entity_type: "user",
    entity_id: data.targetUserId,
    metadata: { action: data.action },
  });
  if (auditError) throw new Error("Não foi possível registrar a ação. Nenhuma conta foi alterada.");
  if (data.action === "delete") {
    // Auth's soft deletion removes login identifiers without cascading through
    // orders, payment records or other historical foreign keys.
    const { error } = await admin.auth.admin.deleteUser(data.targetUserId, true);
    if (error) throw new Error("Não foi possível excluir a conta. Tente novamente.");
  } else {
    const { error } = await admin.auth.admin.updateUserById(data.targetUserId, {
      ban_duration: data.action === "block" ? "876000h" : "none",
    });
    if (error) throw new Error("Não foi possível atualizar o bloqueio. Tente novamente.");
  }
  const { error: completionError } = await admin.from("admin_audit_log").insert({
    admin_id: actorId,
    action: `account_${data.action}_completed`,
    entity_type: "user",
    entity_id: data.targetUserId,
    metadata: { action: data.action },
  });
  return { ok: true as const, action: data.action, auditRecorded: !completionError };
}
