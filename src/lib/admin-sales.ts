export type AdminSale = {
  id: string;
  status: string;
  total_cents: number;
  created_at: string;
  establishment_id: string | null;
  cancelled_at: string | null;
  payment_channel: string;
  online_payment_state: string | null;
  is_test: boolean;
};

export function isConfirmedSale(order: AdminSale): boolean {
  if (order.is_test || order.status === "cancelled" || order.status === "refunded") return false;
  if (order.payment_channel === "asaas") {
    return order.online_payment_state === "confirmed" || order.online_payment_state === "received";
  }
  return order.status === "delivered";
}

export function summarizeAdminSales(orders: AdminSale[]) {
  return orders.filter(isConfirmedSale).reduce(
    (total, order) => ({
      count: total.count + 1,
      gross: total.gross + order.total_cents,
      online: total.online + (order.payment_channel === "asaas" ? order.total_cents : 0),
      awaitingDelivery:
        total.awaitingDelivery + (order.status !== "delivered" ? order.total_cents : 0),
    }),
    { count: 0, gross: 0, online: 0, awaitingDelivery: 0 },
  );
}
