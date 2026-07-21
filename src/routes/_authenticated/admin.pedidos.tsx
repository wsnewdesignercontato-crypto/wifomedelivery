import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { brl, dateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/pedidos")({
  component: PedidosPage,
});

type Order = {
  id: string;
  status: string;
  total_cents: number;
  created_at: string;
  establishment_id: string | null;
  cliente_id: string | null;
};

const COLUMNS: { key: string; label: string; color: string }[] = [
  { key: "placed", label: "Recebido", color: "bg-blue-500" },
  { key: "accepted", label: "Aceito", color: "bg-indigo-500" },
  { key: "preparing", label: "Preparando", color: "bg-amber-500" },
  { key: "ready", label: "Pronto", color: "bg-lime-500" },
  { key: "waiting_courier", label: "Aguard. courier", color: "bg-orange-500" },
  { key: "on_the_way", label: "A caminho", color: "bg-cyan-500" },
  { key: "delivered", label: "Entregue", color: "bg-emerald-500" },
  { key: "cancelled", label: "Cancelado", color: "bg-rose-500" },
];

async function fetchOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select("id,status,total_cents,created_at,establishment_id,cliente_id")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as Order[];
}

function PedidosPage() {
  const { data, isLoading } = useQuery({ queryKey: ["admin-orders-kanban"], queryFn: fetchOrders, refetchInterval: 15000 });
  const qc = useQueryClient();

  useEffect(() => {
    const ch = supabase
      .channel("admin-kanban")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-orders-kanban"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const grouped = new Map<string, Order[]>();
  COLUMNS.forEach((c) => grouped.set(c.key, []));
  (data ?? []).forEach((o) => {
    const k = COLUMNS.find((c) => c.key === o.status)?.key;
    if (k) grouped.get(k)!.push(o);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ShoppingBag className="h-6 w-6 text-primary" /> Pedidos
        </h1>
        <p className="text-sm text-muted-foreground">
          Últimos 300 pedidos · atualização em tempo real.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        {COLUMNS.map((col) => {
          const items = grouped.get(col.key) ?? [];
          return (
            <div key={col.key} className="flex min-h-[300px] flex-col rounded-2xl border border-border bg-card p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${col.color}`} />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    {col.label}
                  </h3>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold tabular-nums">
                  {items.length}
                </span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto">
                {isLoading &&
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
                  ))}
                {items.slice(0, 30).map((o) => (
                  <div
                    key={o.id}
                    className="rounded-lg border border-border/60 bg-background/50 p-3 text-xs transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        #{o.id.slice(0, 8)}
                      </span>
                      <span className={`font-bold tabular-nums ${o.status === "delivered" ? "text-success" : "text-foreground"}`}>
                        {brl(o.total_cents)}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{dateTime(o.created_at)}</p>
                  </div>
                ))}
                {!isLoading && items.length === 0 && (
                  <p className="py-8 text-center text-[11px] text-muted-foreground">Vazio</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
