import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const placeOrderInput = z.object({
  establishment_id: z.string().uuid(),
  forma_pagamento: z.enum(["pix", "cartao", "dinheiro", "carteira"]),
  endereco: z.object({
    label: z.string().optional(),
    rua: z.string().min(1),
    numero: z.string().optional().nullable(),
    complemento: z.string().optional().nullable(),
    bairro: z.string().optional().nullable(),
    cidade: z.string().min(1),
    estado: z.string().optional().nullable(),
    lat: z.number().optional().nullable(),
    lng: z.number().optional().nullable(),
    cep: z.string().optional().nullable(),
  }),
  observacoes: z.string().max(500).optional().nullable(),
  coupon_code: z.string().trim().max(50).optional().nullable(),
});

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof placeOrderInput>) => placeOrderInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Carrinho do usuário para essa loja
    const { data: items, error: cartErr } = await supabase
      .from("cart_items")
      .select("product_id,nome_snapshot,preco_unit_cents,quantidade,observacoes")
      .eq("user_id", userId)
      .eq("establishment_id", data.establishment_id);
    if (cartErr) throw new Error(cartErr.message);
    if (!items || items.length === 0) throw new Error("Carrinho vazio");

    const { data: loja, error: lojaErr } = await supabase
      .from("establishments")
      .select("id,taxa_entrega_cents,pedido_minimo_cents,is_open,status")
      .eq("id", data.establishment_id)
      .maybeSingle();
    if (lojaErr) throw new Error(lojaErr.message);
    if (!loja || loja.status !== "aprovado") throw new Error("Loja indisponível");

    const subtotal = items.reduce(
      (s, i) => s + i.preco_unit_cents * i.quantidade,
      0,
    );
    if (subtotal < loja.pedido_minimo_cents) {
      throw new Error(
        `Pedido mínimo desta loja é R$ ${(loja.pedido_minimo_cents / 100)
          .toFixed(2)
          .replace(".", ",")}`,
      );
    }

    // Cupom (opcional)
    let desconto = 0;
    let frete = loja.taxa_entrega_cents;
    if (data.coupon_code) {
      const { data: cup } = await supabase
        .from("coupons")
        .select(
          "id,type,value_cents,percent,min_order_cents,max_discount_cents,ativo,starts_at,expires_at,usage_limit,used_count,establishment_id",
        )
        .eq("code", data.coupon_code.trim().toUpperCase())
        .maybeSingle();
      if (!cup || !cup.ativo) throw new Error("Cupom inválido");
      if (cup.establishment_id && cup.establishment_id !== loja.id)
        throw new Error("Cupom não vale para esta loja");
      if (cup.starts_at && new Date(cup.starts_at) > new Date())
        throw new Error("Cupom ainda não está ativo");
      if (cup.expires_at && new Date(cup.expires_at) < new Date())
        throw new Error("Cupom expirado");
      if (cup.usage_limit != null && cup.used_count >= cup.usage_limit)
        throw new Error("Cupom esgotado");
      if (subtotal < cup.min_order_cents)
        throw new Error("Pedido abaixo do mínimo para este cupom");
      if (cup.type === "percent") {
        desconto = Math.floor((subtotal * Number(cup.percent)) / 100);
        if (cup.max_discount_cents)
          desconto = Math.min(desconto, cup.max_discount_cents);
      } else if (cup.type === "fixed") {
        desconto = cup.value_cents;
      } else if (cup.type === "free_delivery") {
        desconto = frete;
      }
      desconto = Math.max(0, Math.min(desconto, subtotal + frete));
    }

    const total = Math.max(0, subtotal + frete - desconto);

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        cliente_id: userId,
        establishment_id: loja.id,
        status: "placed",
        subtotal_cents: subtotal,
        frete_cents: frete,
        desconto_cents: desconto,
        total_cents: total,
        forma_pagamento: data.forma_pagamento,
        endereco_entrega: data.endereco,
        observacoes: data.observacoes ?? null,
      })
      .select("id")
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message ?? "Falha ao criar pedido");

    const { error: itensErr } = await supabase.from("order_items").insert(
      items.map((i) => ({
        order_id: order.id,
        product_id: i.product_id,
        nome_snapshot: i.nome_snapshot,
        preco_unit_cents: i.preco_unit_cents,
        quantidade: i.quantidade,
        observacoes: i.observacoes,
      })),
    );
    if (itensErr) throw new Error(itensErr.message);

    // Limpa carrinho da loja
    await supabase
      .from("cart_items")
      .delete()
      .eq("user_id", userId)
      .eq("establishment_id", loja.id);

    return { order_id: order.id, total_cents: total, desconto_cents: desconto };
  });
