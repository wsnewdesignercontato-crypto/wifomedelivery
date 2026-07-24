import { useEffect, useState } from "react";
import { Bell, CheckCheck, Package, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { playBellChime } from "@/lib/notification-sound";

type Notif = {
  id: string;
  titulo: string;
  mensagem: string;
  link_url: string | null;
  lida: boolean;
  created_at: string;
};

type Audience = "cliente" | "estabelecimento" | "entregador";

export function NotificationsBell({
  userId,
  audience = "cliente",
}: {
  userId: string;
  audience?: Audience;
}) {
  const [items, setItems] = useState<Notif[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    const audienceOk = (a: string | null | undefined) =>
      !a || a === audience || a === "all";
    async function load() {
      const { data } = await supabase
        .from("notifications")
        .select("id,titulo,mensagem,link_url,lida,created_at,audience")
        .eq("user_id", userId)
        .eq("lida", false)
        .or(`audience.is.null,audience.eq.${audience},audience.eq.all`)
        .order("created_at", { ascending: false })
        .limit(20);
      if (alive) setItems((data ?? []) as Notif[]);
    }
    load();
    const ch = supabase
      .channel(`notif-${audience}-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (p) => {
          const n = p.new as Notif & { audience?: string | null };
          if (!audienceOk(n.audience)) return;
          if (n.lida) return;
          setItems((prev) => [n, ...prev].slice(0, 20));
          playBellChime();
          const isDelivered = /entregue/i.test(n.mensagem);
          if (isDelivered && audience === "cliente") {
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
              try { navigator.vibrate?.([120, 60, 120]); } catch { /* ignore */ }
            }
            toast.success("🎉 " + n.titulo, {
              description: n.mensagem,
              duration: 8000,
              action: n.link_url
                ? { label: "Avaliar", onClick: () => handleClick(n) }
                : undefined,
            });
          } else {
            toast(n.titulo, {
              description: n.mensagem,
              action: n.link_url
                ? { label: "Ver", onClick: () => handleClick(n) }
                : undefined,
            });
          }
        },
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, audience]);

  const unread = items.length;

  async function handleClick(n: Notif) {
    setItems((prev) => prev.filter((i) => i.id !== n.id));
    await supabase.from("notifications").update({ lida: true }).eq("id", n.id);
    if (n.link_url) navigate({ to: n.link_url });
  }

  async function markAllRead() {
    if (unread === 0) return;
    const ids = items.map((i) => i.id);
    setItems([]);
    await supabase.from("notifications").update({ lida: true }).in("id", ids);
  }

  function timeAgo(iso: string) {
    const diff = Math.max(0, Date.now() - new Date(iso).getTime());
    const m = Math.floor(diff / 60000);
    if (m < 1) return "agora";
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="relative" aria-label="Notificações">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-[0_0_0_2px_hsl(var(--background))]">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        sideOffset={12}
        collisionPadding={16}
        className="w-[min(92vw,22rem)] overflow-hidden rounded-2xl border border-border/60 bg-card/95 p-0 shadow-2xl backdrop-blur-xl"
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-primary/80 px-4 py-3.5 text-primary-foreground">
          <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-white/15 backdrop-blur-sm">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight">Notificações</p>
                <p className="text-[11px] leading-tight text-primary-foreground/80">
                  {unread > 0 ? `${unread} nova${unread > 1 ? "s" : ""}` : "Tudo em dia"}
                </p>
              </div>
            </div>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold transition hover:bg-white/25"
              >
                <CheckCheck className="h-3 w-3" />
                Marcar lidas
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[65vh] overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-muted">
                <Bell className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">Sem notificações</p>
              <p className="text-xs text-muted-foreground">
                Você verá aqui novas atualizações.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => handleClick(n)}
                    className="group flex w-full items-start gap-3 bg-primary/5 px-3 py-3 text-left transition hover:bg-muted/60"
                  >
                    <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                      <Package className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{n.titulo}</p>
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {n.mensagem}
                      </p>
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                        {timeAgo(n.created_at)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
