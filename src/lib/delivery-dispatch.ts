import { supabase } from "@/integrations/supabase/client";

export type DeliveryDispatchResult = "dispatched" | "exists";

type DispatchOrderDeliveryArgs = {
  orderId: string;
  feeCents: number;
  courierId?: string | null;
};

export async function dispatchOrderDelivery({
  orderId,
  feeCents,
  courierId = null,
}: DispatchOrderDeliveryArgs): Promise<DeliveryDispatchResult> {
  const { data, error } = await supabase.rpc("dispatch_order_delivery", {
    p_order_id: orderId,
    p_fee_cents: feeCents,
    p_courier_id: courierId,
  });
  if (error) throw error;
  if (data !== "dispatched" && data !== "exists") {
    throw new Error("Resposta inválida ao chamar entregador");
  }
  return data;
}
