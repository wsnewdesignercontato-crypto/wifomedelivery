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
  const { data: existing, error: fetchError } = await supabase
    .from("deliveries")
    .select("id,status")
    .eq("order_id", orderId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (existing) {
    if (existing.status !== "cancelled") return "exists";

    const { error: updateError } = await supabase
      .from("deliveries")
      .update({
        status: "broadcasting",
        entregador_id: courierId,
        valor_entrega_cents: feeCents,
        aceito_em: null,
        coletado_em: null,
        entregue_em: null,
        lat: null,
        lng: null,
      })
      .eq("id", existing.id);

    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await supabase.from("deliveries").insert({
      order_id: orderId,
      status: "broadcasting",
      entregador_id: courierId,
      valor_entrega_cents: feeCents,
    });

    if (insertError) throw insertError;
  }

  const { error: orderError } = await supabase
    .from("orders")
    .update({ status: "waiting_courier" })
    .eq("id", orderId);

  if (orderError) throw orderError;

  return "dispatched";
}
