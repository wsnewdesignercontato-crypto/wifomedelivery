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

type Notif = {
  id: string;
  titulo: string;
  mensagem: string;
  link_url: string | null;
  lida: boolean;
  created_at: string;
};

export function NotificationsBell({ userId }: { userId: string }) {
  const [items, setItems] = useState<Notif[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    // Only notifications destinadas a clientes (ou gerais)
    const audienceOk = (a: string | null | undefined) =>
      !a || a === "cliente" || a === "all";
    async function load() {
      const { data } = await supabase
        .from("notifications")
        .select("id,titulo,mensagem,link_url,lida,created_at,audience")
        .eq("user_id", userId)
        .or("audience.is.null,audience.eq.cliente,audience.eq.all")
        .order("created_at", { ascending: false })
        .limit(20);
      if (alive) setItems((data ?? []) as Notif[]);
    }
    load();
    const ch = supabase
      .channel(`notif-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (p) => {
          const n = p.new as Notif & { audience?: string | null };
          if (!audienceOk(n.audience)) return;
          setItems((prev) => [n, ...prev].slice(0, 20));
          const isDelivered = /entregue/i.test(n.mensagem);
          if (isDelivered) {
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
              try { navigator.vibrate?.([120, 60, 120]); } catch { /* ignore */ }
            }
            toast.success("🎉 " + n.titulo, {
              description: n.mensagem,
              duration: 8000,
              action: n.link_url
                ? { label: "Avaliar", onClick: () => navigate({ to: n.link_url! }) }
                : undefined,
            });
          } else {
            toast(n.titulo, {
              description: n.mensagem,
              action: n.link_url
                ? { label: "Ver", onClick: () => navigate({ to: n.link_url! }) }
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
  }, [userId]);

  const unread = items.filter((i) => !i.lida).length;

  async function markAllRead() {
    if (unread === 0) return;
    await supabase
      .from("notifications")
      .update({ lida: true })
      .eq("user_id", userId)
      .eq("lida", false);
    setItems((prev) => prev.map((i) => ({ ...i, lida: true })));
  }

  return (
    <Popover onOpenChange={(o) => o && markAllRead()}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="relative" aria-label="Notificações">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2 text-sm font-semibold">
          Notificações
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">
              Nenhuma notificação por enquanto.
            </p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  if (n.link_url) navigate({ to: n.link_url });
                }}
                className="block w-full border-b border-border px-3 py-2.5 text-left hover:bg-muted/50"
              >
                <p className="text-sm font-medium">{n.titulo}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{n.mensagem}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {new Date(n.created_at).toLocaleString("pt-BR")}
                </p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
