import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type AppRole = "cliente" | "estabelecimento" | "entregador" | "admin";

async function assertAdmin(context: { supabase: any; userId: string }) {
  // @ts-expect-error has_role RPC is in private schema
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export const listAppUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { search?: string; page?: number }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const page = data.page ?? 1;
    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw new Error(error.message);
    const users = list.users.map((u) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      confirmed: !!u.email_confirmed_at,
    }));
    const filtered = data.search
      ? users.filter((u) => u.email?.toLowerCase().includes(data.search!.toLowerCase()))
      : users;

    // Fetch roles for these users
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", filtered.map((u) => u.id));
    const rolesByUser = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    });

    return filtered.map((u) => ({ ...u, roles: rolesByUser.get(u.id) ?? [] }));
  });

const roleSchema = z.enum(["cliente", "estabelecimento", "entregador", "admin"]);

export const grantAppRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { targetUserId: string; role: AppRole }) =>
    z.object({ targetUserId: z.string().uuid(), role: roleSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.targetUserId, role: data.role }, { onConflict: "user_id,role" });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: "grant_role",
      target_type: "user",
      target_id: data.targetUserId,
      metadata: { role: data.role },
    });
    return { ok: true };
  });

export const revokeAppRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { targetUserId: string; role: AppRole }) =>
    z.object({ targetUserId: z.string().uuid(), role: roleSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.role === "admin") {
      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin");
      if ((count ?? 0) <= 1) throw new Error("Não é possível remover o último admin");
    }
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.targetUserId)
      .eq("role", data.role);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: "revoke_role",
      target_type: "user",
      target_id: data.targetUserId,
      metadata: { role: data.role },
    });
    return { ok: true };
  });
