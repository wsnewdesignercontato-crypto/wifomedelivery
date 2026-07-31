import { createFileRoute } from "@tanstack/react-router";
import { sendWebPush } from "@/lib/web-push.server";

type NotificationRow = {
  id: string;
  user_id: string | null;
  titulo: string;
  mensagem: string;
  link_url: string | null;
};

/**
 * Descarrega notificações pendentes para os aparelhos inscritos.
 * Não recebe nem devolve dados: só processa o que já está na fila
 * (cada notificação é enviada uma única vez, controlada por pushed_at).
 */
async function flushPending() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
    .in("id", rows.map((r) => r.id));

  const userIds = [...new Set(rows.map((r) => r.user_id!))];
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth")
    .in("user_id", userIds);

  const byUser = new Map<string, typeof subs>();
  for (const s of subs ?? []) {
    const list = byUser.get(s.user_id) ?? [];
    list.push(s);
    byUser.set(s.user_id, list as typeof subs);
  }

  // Contagem de não lidas por usuário (para o "balãozinho" no ícone do app)
  const unreadByUser = new Map<string, number>();
  await Promise.all(
    userIds.map(async (uid) => {
      const { count } = await supabaseAdmin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("lida", false);
      unreadByUser.set(uid, count ?? 0);
    }),
  );

  let sent = 0;
  const dead: string[] = [];

  for (const row of rows) {
    const targets = byUser.get(row.user_id!) ?? [];
    for (const t of targets) {
      try {
        const status = await sendWebPush(
          { endpoint: t.endpoint, p256dh: t.p256dh, auth: t.auth },
          {
            title: row.titulo,
            body: row.mensagem,
            url: row.link_url ?? "/",
            tag: `wifome-${row.id}`,
            unread: unreadByUser.get(row.user_id!) ?? 0,
          },
        );
        if (status === 404 || status === 410) dead.push(t.id);
        else if (status >= 200 && status < 300) sent++;
      } catch (err) {
        console.error("push failed", err);
      }
    }
  }

  if (dead.length) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", dead);
  }

  return { sent };
}

export const Route = createFileRoute("/api/public/push-dispatch")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await flushPending();
          return Response.json({ ok: true, ...result });
        } catch (err) {
          console.error("push-dispatch error", err);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
