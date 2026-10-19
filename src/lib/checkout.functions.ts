import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { orderQuoteSchema } from "@/lib/commerce";

const quoteOrderInput = z.object({
  establishment_id: z.string().uuid(),
  idempotency_key: z.string().uuid(),
  forma_pagamento: z.enum(["pix", "cartao", "dinheiro"]),
  tipo_entrega: z.enum(["delivery", "pickup"]).default("delivery"),
  endereco: z
    .object({
      label: z.string().optional(),
      rua: z.string().min(1),
      numero: z.string().optional().nullable(),
      complemento: z.string().optional().nullable(),
      bairro: z.string().optional().nullable(),
      cidade: z.string().min(1),
      estado: z.string().optional().nullable(),
      lat: z.number().min(-90).max(90).optional().nullable(),
      lng: z.number().min(-180).max(180).optional().nullable(),
      cep: z.string().optional().nullable(),
    })
    .nullable()
    .optional(),
  observacoes: z.string().max(500).optional().nullable(),
  coupon_code: z.string().trim().max(50).optional().nullable(),
});

export const placeOrderInput = quoteOrderInput.extend({
  expected_total_cents: z.number().int().nonnegative(),
  test_mode: z.boolean().default(false),
});

export type CheckoutQuoteInput = z.infer<typeof quoteOrderInput>;

export const quoteOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: CheckoutQuoteInput) => quoteOrderInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("quote_order", {
      p_establishment_id: data.establishment_id,
      p_idempotency_key: data.idempotency_key,
      p_forma_pagamento: data.forma_pagamento,
      p_tipo_entrega: data.tipo_entrega,
      p_endereco: data.endereco ?? null,
      p_observacoes: data.observacoes ?? undefined,
      p_coupon_code: data.coupon_code ?? undefined,
    });
    if (error) throw new Error(error.message);
    return orderQuoteSchema.parse(result);
  });

const placedOrder = z.object({
  order_id: z.string().uuid(),
  total_cents: z.number().int().nonnegative(),
  desconto_cents: z.number().int().nonnegative(),
});

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.infer<typeof placeOrderInput>) => placeOrderInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc(
      data.test_mode ? "checkout_test_order" : "checkout_order",
      {
        p_establishment_id: data.establishment_id,
        p_idempotency_key: data.idempotency_key,
        p_forma_pagamento: data.forma_pagamento,
        p_tipo_entrega: data.tipo_entrega,
        p_endereco: data.endereco ?? null,
        p_observacoes: data.observacoes ?? undefined,
        p_coupon_code: data.coupon_code ?? undefined,
        p_expected_total_cents: data.expected_total_cents,
      },
    );
    if (error)
      throw new Error(
        /^[0-9A-Z]{5}$/.test(error.code ?? "")
          ? `CHECKOUT_REJECTED:${error.message}`
          : error.message,
      );
    return placedOrder.parse(result);
  });
