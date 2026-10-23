import { supabase } from "@/integrations/supabase/client";
import type { AdminSale } from "./admin-sales";

// Orders measure sales; the ledger remains the source of delivered payouts.
export async function loadAdminSales(since?: string): Promise<AdminSale[]> {
  const rows: AdminSale[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = supabase
      .from("orders")
      .select(
        "id,status,total_cents,created_at,establishment_id,cancelled_at,payment_channel,online_payment_state,is_test",
      )
      .eq("is_test", false);
    if (since) query = query.gte("created_at", since);
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}
