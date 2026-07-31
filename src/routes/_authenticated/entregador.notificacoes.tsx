import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell } from "lucide-react";
import { useMyCourier } from "@/hooks/use-courier";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/entregador/notificacoes")({
  component: Notif,
});

type N = { id: string; titulo: string; mensagem: string; lida: boolean; created_at: string; link_url: string | null };

function Notif() {
  const { courier } = useMyCourier();
  const [list, setList] = useState<N[]>([]);

  useEffect(() => {
    if (!courier) return;
    supabase.from("notifications").select("*").eq("user_id", courier.user_id)
      .in("audience", ["entregador", "all"])
      .eq("lida", false)
      .order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => setList((data ?? []) as N[]));
  }, [courier]);

  async function marcar(id: string) {
    setList((l) => l.filter((n) => n.id !== id));
    await supabase.from("notifications").update({ lida: true }).eq("id", id);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Notificações</h1>
      <PushToggleCard />
      {list.length === 0 ? (

        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Bell className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Sem notificações.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((n) => (
            <button key={n.id} onClick={() => marcar(n.id)}
              className="w-full rounded-2xl border border-primary/40 bg-primary/5 p-4 text-left shadow-card transition hover:bg-primary/10">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{n.titulo}</p>
                <Badge>Nova</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{n.mensagem}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">{new Date(n.created_at).toLocaleString("pt-BR")}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

