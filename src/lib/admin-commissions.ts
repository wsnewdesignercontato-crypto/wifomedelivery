import type { AdminSale } from "./admin-sales";

export type AdminCommissionOrder = AdminSale & {
  store_name: string;
  subtotal_cents: number;
  frete_cents: number;
  desconto_cents: number;
  commission_cents: number | null;
  courier_commission_cents: number;
  coupon_funder: string | null;
  discount_funder: string | null;
  tipo_entrega: string | null;
};

export function commissionAmounts(order: AdminCommissionOrder) {
  const cents = [
    order.total_cents,
    order.subtotal_cents,
    order.frete_cents,
    order.desconto_cents,
    order.commission_cents,
    order.courier_commission_cents,
  ];
  if (
    cents.some((value) => !Number.isSafeInteger(value) || (value as number) < 0) ||
    order.commission_cents === null ||
    order.courier_commission_cents > order.frete_cents ||
    order.total_cents !== order.subtotal_cents + order.frete_cents - order.desconto_cents
  )
    return null;
  const products = order.commission_cents,
    freight = order.courier_commission_cents;
  const funder =
    order.coupon_funder ?? (order.discount_funder === "establishment" ? "merchant" : "platform");
  const merchant =
    order.subtotal_cents - products - (funder === "merchant" ? order.desconto_cents : 0);
  const courier = order.tipo_entrega === "pickup" ? 0 : order.frete_cents - freight;
  return {
    products,
    freight,
    platform: order.total_cents - merchant - courier,
    merchant,
    courier,
    productRate:
      order.subtotal_cents > 0 ? Math.round((products * 10000) / order.subtotal_cents) / 100 : 0,
  };
}

export function summarizeCommissions(orders: AdminCommissionOrder[]) {
  return orders.reduce(
    (sum, order) => {
      if (
        order.is_test ||
        ["cancelled", "refunded"].includes(order.status) ||
        (order.payment_channel === "asaas"
          ? !["confirmed", "received"].includes(order.online_payment_state ?? "")
          : order.status !== "delivered")
      )
        return sum;
      const amounts = commissionAmounts(order);
      if (!amounts) return { ...sum, unknown: sum.unknown + 1 };
      return {
        products: sum.products + amounts.products,
        freight: sum.freight + amounts.freight,
        platform: sum.platform + amounts.platform,
        unknown: sum.unknown,
      };
    },
    { products: 0, freight: 0, platform: 0, unknown: 0 },
  );
}
