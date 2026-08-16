import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyCourier, fmt } from "@/hooks/use-courier";
import { DollarSign, Package, TrendingUp, Timer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/entregador/ganhos")({
  component: Ganhos,
});

function Ganhos() {
  const { courier } = useMyCourier();
  const [tot, setTot] = useState({ hoje: 0, semana: 0, mes: 0, todos: 0, entregas: 0, medio: 0 });
  const [byDay, setByDay] = useState<{ day: string; total: number }[]>([]);

  useEffect(() => {
    if (!courier) return;
    (async () => {
      const now = new Date();
      const startDay = new Date(now);
      startDay.setHours(0, 0, 0, 0);
      const startWeek = new Date(now);
      startWeek.setDate(now.getDate() - 7);
      const startMonth = new Date(now);
      startMonth.setDate(1);
      startMonth.setHours(0, 0, 0, 0);

      const { data } = await supabase
        .from("deliveries")
        .select("valor_entrega_cents,entregue_em")
        .eq("entregador_id", courier.user_id)
        .eq("status", "delivered")
        .order("entregue_em", { ascending: false })
        .limit(500);
      const rows = (data ?? []) as { valor_entrega_cents: number; entregue_em: string }[];
      const inRange = (d: string, s: Date) => new Date(d) >= s;
      const hoje = rows
        .filter((r) => inRange(r.entregue_em, startDay))
        .reduce((s, r) => s + r.valor_entrega_cents, 0);
      const semana = rows
        .filter((r) => inRange(r.entregue_em, startWeek))
        .reduce((s, r) => s + r.valor_entrega_cents, 0);
      const mes = rows
        .filter((r) => inRange(r.entregue_em, startMonth))
        .reduce((s, r) => s + r.valor_entrega_cents, 0);
      const todos = rows.reduce((s, r) => s + r.valor_entrega_cents, 0);
      const medio = rows.length ? Math.round(todos / rows.length) : 0;
      setTot({ hoje, semana, mes, todos, entregas: rows.length, medio });

      const map = new Map<string, number>();
      rows.forEach((r) => {
        const k = r.entregue_em.slice(0, 10);
        map.set(k, (map.get(k) ?? 0) + r.valor_entrega_cents);
      });
      setByDay(
        Array.from(map.entries())
          .slice(0, 14)
          .reverse()
          .map(([day, total]) => ({ day, total })),
      );
    })();
  }, [courier]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">Ganhos</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card icon={DollarSign} label="Hoje" value={fmt(tot.hoje)} />
        <Card icon={TrendingUp} label="7 dias" value={fmt(tot.semana)} />
        <Card icon={TrendingUp} label="Mês" value={fmt(tot.mes)} />
        <Card icon={Package} label="Total" value={fmt(tot.todos)} />
        <Card icon={Package} label="Entregas" value={String(tot.entregas)} />
        <Card icon={Timer} label="Média/corrida" value={fmt(tot.medio)} />
      </div>
      <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Últimos 14 dias</h2>
        {byDay.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sem dados ainda.</p>
        ) : (
          <div className="space-y-2">
            {byDay.map((d) => {
              const max = Math.max(...byDay.map((x) => x.total));
              const pct = max ? (d.total / max) * 100 : 0;
              return (
                <div key={d.day} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-muted-foreground">
                    {new Date(d.day).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </span>
                  <div className="h-3 flex-1 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-24 text-right text-xs font-semibold">{fmt(d.total)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Card({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-2 text-xl font-black">{value}</p>
    </div>
  );
}
