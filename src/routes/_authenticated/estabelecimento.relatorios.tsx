import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab, fmt } from "@/hooks/use-my-estab";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/estabelecimento/relatorios")({
  component: RelatoriosPage,
});

type OrderRow = { id: string; created_at: string; status: string; total_cents: number };
type ItemRow = { nome_snapshot: string; quantidade: number; preco_unit_cents: number };

function RelatoriosPage() {
  const { estab } = useMyEstab();
  const estabId = estab?.id;
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);

  useEffect(() => {
    if (!estabId) return;
    (async () => {
      const { data: o } = await supabase
        .from("orders")
        .select("id,created_at,status,total_cents")
        .eq("establishment_id", estabId)
        .order("created_at", { ascending: false })
        .limit(300);
      setOrders((o ?? []) as OrderRow[]);
      const ids = (o ?? []).map((x) => x.id);
      if (ids.length) {
        const { data: i } = await supabase
          .from("order_items")
          .select("nome_snapshot,quantidade,preco_unit_cents")
          .in("order_id", ids);
        setItems((i ?? []) as ItemRow[]);
      }
    })();
  }, [estabId]);

  const stats = useMemo(() => {
    const entregues = orders.filter((o) => o.status === "delivered");
    const cancel = orders.filter((o) => o.status === "cancelled");
    const receita = entregues.reduce((s, o) => s + o.total_cents, 0);
    const ticket = entregues.length ? receita / entregues.length : 0;
    const cancelRate = orders.length ? (cancel.length / orders.length) * 100 : 0;
    // mais vendidos
    const map = new Map<string, { qty: number; rev: number }>();
    items.forEach((i) => {
      const cur = map.get(i.nome_snapshot) ?? { qty: 0, rev: 0 };
      cur.qty += i.quantidade;
      cur.rev += i.quantidade * i.preco_unit_cents;
      map.set(i.nome_snapshot, cur);
    });
    const top = Array.from(map.entries())
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 10);
    // horários de pico
    const hourly = new Array(24).fill(0);
    orders.forEach((o) => {
      hourly[new Date(o.created_at).getHours()]++;
    });
    return { receita, ticket, cancelRate, entregues: entregues.length, top, hourly };
  }, [orders, items]);

  function exportCSV() {
    const csv =
      "Produto,Quantidade,Receita\n" +
      stats.top.map(([n, v]) => `${n},${v.qty},${(v.rev / 100).toFixed(2)}`).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mais-vendidos.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const maxHour = Math.max(1, ...stats.hourly);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black tracking-tight">Relatórios</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Pedidos entregues</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black">{stats.entregues}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Receita total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black">{fmt(stats.receita)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Ticket médio</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black">{fmt(Math.round(stats.ticket))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Cancelamento</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black">{stats.cancelRate.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Top 10 produtos</CardTitle>
            <Button size="sm" variant="ghost" onClick={exportCSV}>
              <Download className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              {stats.top.map(([n, v]) => (
                <div key={n} className="flex items-center justify-between">
                  <span className="truncate">{n}</span>
                  <span className="text-muted-foreground">
                    {v.qty}× · {fmt(v.rev)}
                  </span>
                </div>
              ))}
              {stats.top.length === 0 && <p className="text-muted-foreground">Sem dados.</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Horários de pico</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-32 items-end gap-1">
              {stats.hourly.map((v, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-primary/70"
                  style={{ height: `${(v / maxHour) * 100}%`, minHeight: v ? 4 : 0 }}
                  title={`${i}h: ${v}`}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>0h</span>
              <span>6h</span>
              <span>12h</span>
              <span>18h</span>
              <span>23h</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
