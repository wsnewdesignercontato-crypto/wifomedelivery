import { supabase } from "@/integrations/supabase/client";

// The server authorizes the assigned courier and changes delivery, order and
// availability together. Delivery completion continues to require its proof RPC.
export async function transitionCourierDelivery(deliveryId: string, nextStatus: string) {
  const { error } = await supabase.rpc("transition_courier_delivery", {
    p_delivery_id: deliveryId,
    p_next_status: nextStatus,
  });
  if (error) throw error;
}
