import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWebPush } from "@/lib/web-push.server";

type NotificationRow = {
  id: string;
  user_id: string | null;
  titulo: string;
  mensagem: string;
  link_url: string | null;
};

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const encoder = new TextEncoder();

function getPushDispatchSecret() {
  return process.env.PUSH_DISPATCH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function constantTimeEquals(left: string, right: string) {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);

  if (leftBytes.length !== rightBytes.length) return false;

  let diff = 0;
  for (let index = 0; index < leftBytes.length; index++) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }
  return diff === 0;
}

export function isPushDispatchConfigured() {
  return !!getPushDispatchSecret();
}

export function authorizePushDispatchRequest(request: Request) {
  const expectedSecret = getPushDispatchSecret();
  const providedSecret = request.headers.get("x-push-dispatch-secret");

  if (!expectedSecret || !providedSecret) return false;
  return constantTimeEquals(providedSecret, expectedSecret);
}

/**
 * Descarrega notificacoes pendentes para os aparelhos inscritos.
 * Cada notificacao e enviada uma unica vez, controlada por pushed_at.
 */
export async function flushPendingPushNotifications() {
  const { data: pending } = await supabaseAdmin
    .from("notifications")
    .select("id,user_id,titulo,mensagem,link_url")
    .is("pushed_at", null)
    .not("user_id", "is", null)
    .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order("created_at", { ascending: true })
    .limit(50);

  const rows = (pending ?? []) as NotificationRow[];
  if (!rows.length) return { sent: 0 };

  // Marca imediatamente para evitar envio duplicado em chamadas concorrentes.
  await supabaseAdmin
    .from("notifications")
    .update({ pushed_at: new Date().toISOString() })
    .in(
      "id",
      rows.map((row) => row.id),
    );

  const userIds = [...new Set(rows.map((row) => row.user_id!).filter(Boolean))];
  const { data: subscriptions } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth")
    .in("user_id", userIds);

  const byUser = new Map<string, PushSubscriptionRow[]>();
  for (const subscription of (subscriptions ?? []) as PushSubscriptionRow[]) {
    const list = byUser.get(subscription.user_id) ?? [];
    list.push(subscription);
    byUser.set(subscription.user_id, list);
  }

  const unreadByUser = new Map<string, number>();
  await Promise.all(
    userIds.map(async (userId) => {
      const { count } = await supabaseAdmin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("lida", false);
      unreadByUser.set(userId, count ?? 0);
    }),
  );

  let sent = 0;
  const deadSubscriptionIds: string[] = [];

  for (const row of rows) {
    const targets = byUser.get(row.user_id!) ?? [];
    for (const target of targets) {
      try {
        const status = await sendWebPush(
          { endpoint: target.endpoint, p256dh: target.p256dh, auth: target.auth },
          {
            title: row.titulo,
            body: row.mensagem,
            url: row.link_url ?? "/",
            tag: `wifome-${row.id}`,
            unread: unreadByUser.get(row.user_id!) ?? 0,
          },
        );
        if (status === 404 || status === 410) deadSubscriptionIds.push(target.id);
        else if (status >= 200 && status < 300) sent++;
      } catch (error) {
        console.error("push failed", error);
      }
    }
  }

  if (deadSubscriptionIds.length) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", deadSubscriptionIds);
  }

  return { sent };
}
