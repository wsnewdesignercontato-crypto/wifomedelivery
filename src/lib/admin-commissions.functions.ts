import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AdminCommissionOrder } from "./admin-commissions";

export const getAdminCommissionOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminCommissionOrder[]> => {
    const role = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (role.error || role.data !== true) throw new Error("Forbidden");
    // Financial snapshots stay server-only; do not expand browser column grants.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows: AdminCommissionOrder[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabaseAdmin
        .from("orders")
        .select(
          "id,status,total_cents,created_at,establishment_id,cancelled_at,payment_channel,online_payment_state,is_test,subtotal_cents,frete_cents,desconto_cents,commission_cents,courier_commission_cents,coupon_funder,discount_funder,tipo_entrega,establishments(nome)",
        )
        .eq("is_test", false)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + 999);
      if (error) throw new Error(error.message);
      rows.push(
        ...(data ?? []).map(({ establishments, ...order }) => ({
          ...order,
          store_name: establishments?.nome ?? "Loja",
        })),
      );
      if (!data || data.length < 1000) return rows;
    }
  });
