import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AvailableCourier = {
  user_id: string;
  veiculo: string | null;
  avaliacao: number | null;
  lat: number | null;
  lng: number | null;
  last_seen: string | null;
};

export const listAvailableCouriers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AvailableCourier[]> => {
    // Authorize: only admin or establishment owner may list available couriers
    const { data: roles, error: rolesErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (rolesErr) throw new Error(rolesErr.message);
    const allowed = (roles ?? []).some((r) => r.role === "admin" || r.role === "estabelecimento");
    if (!allowed) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .schema("private")
      .rpc("list_available_couriers");
    if (error) throw new Error(error.message);
    return (data ?? []) as AvailableCourier[];
  });
