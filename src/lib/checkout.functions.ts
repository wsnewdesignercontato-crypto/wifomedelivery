import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const quoteInput = z.object({
  establishment_id: z.string().uuid(),
  tipo_entrega: z.enum(["delivery", "pickup"]).default("delivery"),
  coupon_code: z.string().trim().max(50).optional().nullable(),
});
const placeOrderInput = quoteInput.extend({
  forma_pagamento: z.enum(["pix", "cartao", "dinheiro"]),
  checkout_key: z.string().uuid(),
  quote_fingerprint: z.string().regex(/^[a-f0-9]{32}$/),
  endereco: z
    .object({
      label: z.string().max(100).optional(),
      rua: z.string().trim().min(1).max(300),
      numero: z.string().max(30).nullable().optional(),
      complemento: z.string().max(300).nullable().optional(),
      bairro: z.string().max(150).nullable().optional(),
      cidade: z.string().trim().min(1).max(150),
      estado: z.string().max(50).nullable().optional(),
      lat: z.number().finite().min(-90).max(90).nullable().optional(),
      lng: z.number().finite().min(-180).max(180).nullable().optional(),
      cep: z.string().max(20).nullable().optional(),
    })
    .nullable()
    .optional(),
  observacoes: z.string().max(500).optional().nullable(),
});
export type PlaceOrderInput = z.infer<typeof placeOrderInput>;
const quoteResult = z.object({
  subtotal_cents: z.number().int().nonnegative(),
  frete_cents: z.number().int().nonnegative(),
  desconto_cents: z.number().int().nonnegative(),
  total_cents: z.number().int().nonnegative(),
  fingerprint: z.string().regex(/^[a-f0-9]{32}$/),
});
export type CheckoutQuote = z.infer<typeof quoteResult>;
const orderResult = z.object({
  order_id: z.string().uuid(),
  total_cents: z.number().int(),
  desconto_cents: z.number().int(),
});

export const quoteOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof quoteInput>) => quoteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("quote_checkout", {
      p_establishment: data.establishment_id,
      p_type: data.tipo_entrega,
      p_coupon: data.coupon_code ?? null,
    });
    if (error) throw new Error(error.message);
    return quoteResult.parse(result);
  });

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof placeOrderInput>) => placeOrderInput.parse(d))
  .handler(async ({ data, context }) => {
    // One authenticated PostgreSQL transaction owns prices, stock, coupon, items and cart.
    const { data: result, error } = await context.supabase.rpc("submit_checkout", {
      p_establishment: data.establishment_id,
      p_payment: data.forma_pagamento,
      p_type: data.tipo_entrega,
      p_address: data.endereco ?? null,
      p_notes: data.observacoes ?? null,
      p_coupon: data.coupon_code ?? null,
      p_key: data.checkout_key,
      p_fingerprint: data.quote_fingerprint,
    });
    if (error) throw new Error(error.message);
    return orderResult.parse(result);
  });
