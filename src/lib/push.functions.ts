import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { endpoint: string; p256dh: string; auth: string; userAgent?: string }) => {
    if (!data?.endpoint?.startsWith("https://")) throw new Error("endpoint inválido");
    if (!data.p256dh || !data.auth) throw new Error("chaves ausentes");
    if (data.endpoint.length > 1000) throw new Error("endpoint muito longo");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: (data.userAgent ?? "").slice(0, 300),
      },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { endpoint: string }) => {
    if (!data?.endpoint) throw new Error("endpoint inválido");
    return data;
  })
  .handler(async ({ data, context }) => {
    await context.supabase.from("push_subscriptions").delete().eq("endpoint", data.endpoint);
    return { ok: true };
  });

/** Envia uma notificação de teste para todos os aparelhos do próprio usuário. */
export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sendWebPush } = await import("@/lib/web-push.server");

    const { data: subs } = await context.supabase
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("user_id", context.userId);

    if (!subs?.length) return { ok: false, sent: 0, reason: "sem-aparelhos" as const };

    const { count } = await context.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("lida", false);

    let sent = 0;
    const dead: string[] = [];
    for (const s of subs) {
      try {
        const status = await sendWebPush(
          { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
          {
            title: "WiFome — notificação de teste",
            body: "Se você está vendo isto, os alertas no celular estão funcionando! Toque para abrir o app.",
            url: "/app",
            tag: "wifome-teste",
            unread: count ?? 0,
          },
        );
        if (status === 404 || status === 410) dead.push(s.id);
        else if (status >= 200 && status < 300) sent++;
      } catch (err) {
        console.error("teste push falhou", err);
      }
    }

    if (dead.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("push_subscriptions").delete().in("id", dead);
    }

    return { ok: sent > 0, sent, badge: count ?? 0 };
  });
