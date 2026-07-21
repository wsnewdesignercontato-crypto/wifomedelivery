import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { useMyCourier, fmt } from "@/hooks/use-courier";
import { History } from "lucide-react";

export const Route = createFileRoute("/_authenticated/entregador/historico")({
  component: Historico,
});

type Row = { id: string; status: string; valor_entrega_cents: number; entregue_em: string | null; aceito_em: string | null; order_id: string };

function Historico() {
  const { courier } = useMyCourier();
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<"todos" | "delivered" | "cancelled">("todos");

  useEffect(() => {
    if (!courier) return;
    let q = supabase.from("deliveries").select("id,status,valor_entrega_cents,entregue_em,aceito_em,order_id")
      .eq("entregador_id", courier.user_id).order("aceito_em", { ascending: false }).limit(100);
    if (filter !== "todos") q = q.eq("status", filter);
    q.then(({ data }) => setRows((data ?? []) as Row[]));
  }, [courier, filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Histórico</h1>
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1 text-xs">
          {(["todos", "delivered", "cancelled"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 ${filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
              {f === "todos" ? "Todos" : f === "delivered" ? "Entregues" : "Cancelados"}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <History className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma entrega no histórico.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-card">
              <div>
                <p className="text-sm font-semibold">#{r.order_id.slice(0, 8)}</p>
                <p className="text-xs text-muted-foreground">{r.entregue_em ? new Date(r.entregue_em).toLocaleString("pt-BR") : "—"}</p>
              </div>
              <div className="text-right">
                <p className={`font-bold ${r.status === "delivered" ? "text-success" : "text-primary"}`}>{fmt(r.valor_entrega_cents)}</p>
                <Badge variant={r.status === "delivered" ? "success" : "destructive"} className="mt-1">{r.status === "delivered" ? "Entregue" : r.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
