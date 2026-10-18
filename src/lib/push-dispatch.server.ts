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
  const { data: pending, error: pendingError } = await supabaseAdmin
    .from("notifications")
    .select("id,user_id,titulo,mensagem,link_url")
    .is("pushed_at", null)
    .not("user_id", "is", null)
    .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order("created_at", { ascending: true })
    .limit(50);

  if (pendingError) throw pendingError;
  const rows = (pending ?? []) as NotificationRow[];
  if (!rows.length) return { sent: 0 };

  // Compare-and-set: concurrent webhook/cron calls cannot claim the same row.
  const claimedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("notifications")
    .update({ pushed_at: claimedAt })
    .in(
      "id",
      rows.map((row) => row.id),
    )
    .is("pushed_at", null)
    .select("id,user_id,titulo,mensagem,link_url");
  if (claimError) throw claimError;
  const claimedRows = (claimed ?? []) as NotificationRow[];
  if (!claimedRows.length) return { sent: 0 };

  try {
    const userIds = [...new Set(claimedRows.map((row) => row.user_id!).filter(Boolean))];
    const { data: subscriptions, error: subscriptionsError } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id,user_id,endpoint,p256dh,auth")
      .in("user_id", userIds);

    if (subscriptionsError) throw subscriptionsError;

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

    const retryIds: string[] = [];
    for (const row of claimedRows) {
      let accepted = 0;
      let retryable = false;
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
          else if (status >= 200 && status < 300) {
            sent++;
            accepted++;
          } else {
            retryable = true;
            console.error("[push-dispatch] Push service rejected delivery", { status });
          }
        } catch (error) {
          retryable = true;
          console.error("[push-dispatch] Delivery failed", error);
        }
      }
      // A successful device delivery is final; do not re-alert it because another device failed.
      if (retryable && accepted === 0) retryIds.push(row.id);
    }

    if (retryIds.length) {
      const { error } = await supabaseAdmin
        .from("notifications")
        .update({ pushed_at: null })
        .in("id", retryIds)
        .eq("pushed_at", claimedAt);
      if (error) throw error;
    }

    if (deadSubscriptionIds.length) {
      await supabaseAdmin.from("push_subscriptions").delete().in("id", deadSubscriptionIds);
    }

    return { sent };
  } catch (error) {
    // Keep failed batches retryable instead of silently marking them as delivered.
    await supabaseAdmin
      .from("notifications")
      .update({ pushed_at: null })
      .in(
        "id",
        claimedRows.map((row) => row.id),
      )
      .eq("pushed_at", claimedAt);
    throw error;
  }
}
