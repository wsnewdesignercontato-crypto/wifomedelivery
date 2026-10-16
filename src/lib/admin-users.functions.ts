import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

type AppRole = "cliente" | "estabelecimento" | "entregador" | "admin";

async function assertAdmin(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export const listAppUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { search?: string; page?: number }) =>
    z
      .object({
        search: z.string().trim().max(254).default(""),
        page: z.number().int().min(1).max(100000).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: result, error } = await context.supabase.rpc("admin_search_users", {
      p_search: data.search,
      p_page: data.page,
      p_per_page: 50,
    });
    if (error) throw new Error(error.message);
    return result as {
      users: {
        id: string;
        email: string | null;
        created_at: string;
        last_sign_in_at: string | null;
        confirmed: boolean;
        roles: string[];
      }[];
      page: number;
      total: number;
      totalPages: number;
    };
  });

const roleSchema = z.enum(["cliente", "estabelecimento", "entregador", "admin"]);

export const grantAppRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { targetUserId: string; role: AppRole }) =>
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
      admin_id: context.userId,
      action: "grant_role",
      entity_type: "user",
      entity_id: data.targetUserId,
      metadata: { role: data.role },
    });
    return { ok: true };
  });

export const revokeAppRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { targetUserId: string; role: AppRole }) =>
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
      admin_id: context.userId,
      action: "revoke_role",
      entity_type: "user",
      entity_id: data.targetUserId,
      metadata: { role: data.role },
    });
    return { ok: true };
  });
