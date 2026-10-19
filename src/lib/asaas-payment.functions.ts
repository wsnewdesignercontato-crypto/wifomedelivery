import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { placeOrderInput } from "./checkout.functions";
import { validatePayer, validateCard, type PaymentView } from "./asaas-payment-contract";
type Identity = {
  userId: string;
  supabase: {
    auth: {
      getUser: () => Promise<{
        data: { user: { id: string; email_confirmed_at?: string } | null };
        error: unknown;
      }>;
    };
  };
};
async function fresh(context: Identity) {
  const { data, error } = await context.supabase.auth.getUser();
  if (error || !data.user || data.user.id !== context.userId || !data.user.email_confirmed_at)
    throw new Error("Unauthorized");
}
export const requirePaymentUser = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ context, next }) => {
    await fresh(context);
    return next();
  });
const requireCustomer = createMiddleware({ type: "function" })
  .middleware([requirePaymentUser])
  .server(async ({ context, next }) => {
    const role = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "cliente",
    });
    if (role.error || role.data !== true) throw new Error("Forbidden");
    return next();
  });
const orderInput = z.object({ orderId: z.string().uuid() }).strict();
const retryInput = orderInput.extend({ payer: z.unknown(), card: z.unknown().optional() }).strict();
const onlineInput = z
  .object({ checkout: placeOrderInput, payer: z.unknown(), card: z.unknown().optional() })
  .strict();
function safeParse<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new Error("Confira os dados do pedido e do pagamento.");
  return r.data;
}
function paymentInput(data: unknown) {
  const input = safeParse(onlineInput, data);
  if (input.checkout.test_mode || input.checkout.forma_pagamento === "dinheiro")
    throw new Error("Escolha Pix ou cartão para o pagamento online.");
  return {
    ...input,
    payer: input.checkout.expected_total_cents === 0 ? undefined : validatePayer(input.payer),
    card: input.card === undefined ? undefined : validateCard(input.card),
  };
}
function requestContext() {
  const request = getRequest();
  return {
    https:
      new URL(request.url).protocol === "https:" ||
      (process.env.VERCEL === "1" && request.headers.get("x-forwarded-proto") === "https"),
    remoteIp: (request.headers.get("x-vercel-forwarded-for") ?? "").split(",")[0].trim(),
  };
}
async function deps() {
  const { paymentStore, paymentContext, paymentRpc } = await import("./asaas-payment-store.server");
  const { createPaymentService } = await import("./asaas-payment-service.server");
  return {
    store: paymentStore,
    context: paymentContext,
    rpc: paymentRpc,
    service: createPaymentService(paymentStore),
  };
}
export const getOnlinePaymentAvailability = createServerFn({ method: "POST" })
  .middleware([requirePaymentUser])
  .handler(async () => {
    const { rpc } = await deps();
    const status = await rpc<{ enabled: boolean }>("asaas_online_status");
    return {
      enabled: status.enabled === true,
      methods: status.enabled ? (["pix", "cartao"] as const) : [],
    };
  });
export const startOnlineOrder = createServerFn({ method: "POST" })
  .middleware([requireCustomer])
  .validator(paymentInput)
  .handler(async ({ data, context }) => {
    const { service, store, rpc } = await deps();
    const request = requestContext();
    if (data.card && !request.https)
      throw new Error("Use uma conexão segura para pagar com cartão.");
    const status = await rpc<{ enabled: boolean }>("asaas_online_status");
    if (!status.enabled)
      throw new Error("Pagamento online indisponível. Escolha pagar na entrega.");
    const c = data.checkout;
    const result = await context.supabase.rpc("checkout_online_order", {
      p_establishment_id: c.establishment_id,
      p_idempotency_key: c.idempotency_key,
      p_forma_pagamento: c.forma_pagamento,
      p_tipo_entrega: c.tipo_entrega ?? "delivery",
      p_endereco: c.endereco ?? null,
      p_observacoes: c.observacoes ?? undefined,
      p_coupon_code: c.coupon_code ?? undefined,
      p_expected_total_cents: c.expected_total_cents,
    });
    if (result.error)
      throw new Error(
        "Não foi possível confirmar o pedido. Atualize os valores e confira seus dados.",
      );
    const parsed = z
      .object({ order_id: z.string().uuid(), total_cents: z.number().int().nonnegative() })
      .safeParse(result.data);
    if (!parsed.success) throw new Error("Não foi possível confirmar o pedido.");
    const view =
      parsed.data.total_cents === 0
        ? await store.view(context.userId, parsed.data.order_id)
        : await service.runPaymentAttempt(
            context.userId,
            parsed.data.order_id,
            data.payer,
            data.card,
            request,
          );
    await fresh(context);
    return view;
  });
export const retryOnlinePayment = createServerFn({ method: "POST" })
  .middleware([requireCustomer])
  .validator((data: unknown) => {
    const i = safeParse(retryInput, data);
    return {
      ...i,
      payer: validatePayer(i.payer),
      card: i.card === undefined ? undefined : validateCard(i.card),
    };
  })
  .handler(async ({ data, context }) => {
    const { service } = await deps();
    const view = await service.runPaymentAttempt(
      context.userId,
      data.orderId,
      data.payer,
      data.card,
      requestContext(),
      true,
    );
    await fresh(context);
    return view;
  });
export const getOnlinePayment = createServerFn({ method: "POST" })
  .middleware([requirePaymentUser])
  .validator((data: unknown) => safeParse(orderInput, data))
  .handler(async ({ data, context }): Promise<PaymentView> => {
    const { store } = await deps();
    return store.view(context.userId, data.orderId);
  });
export const refreshOnlinePayment = createServerFn({ method: "POST" })
  .middleware([requirePaymentUser])
  .validator((data: unknown) => safeParse(orderInput, data))
  .handler(async ({ data, context }) => {
    const { service, store, context: read } = await deps();
    const a = await read(context.userId, data.orderId);
    let view;
    if (a) {
      try {
        view = await service.reconcilePayment(a);
      } catch {
        view = await store.view(context.userId, data.orderId);
      }
    } else view = await store.view(context.userId, data.orderId);
    await fresh(context);
    return view;
  });
export const cancelOnlinePayment = createServerFn({ method: "POST" })
  .middleware([requirePaymentUser])
  .validator((data: unknown) => safeParse(orderInput, data))
  .handler(async ({ data, context }) => {
    const { service, store, context: read } = await deps();
    const a = await read(context.userId, data.orderId);
    let view;
    if (a) {
      try {
        view = await service.cancelPayment(a);
      } catch {
        view = await store.view(context.userId, data.orderId);
      }
    } else view = await store.cancelRequest(context.userId, data.orderId);
    await fresh(context);
    return view;
  });
