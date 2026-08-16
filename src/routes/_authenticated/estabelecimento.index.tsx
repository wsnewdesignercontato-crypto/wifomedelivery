import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab, fmt } from "@/hooks/use-my-estab";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreCard } from "@/components/score-card";
import { ShoppingBag, DollarSign, Clock, TrendingUp, AlertTriangle, Star } from "lucide-react";

export const Route = createFileRoute("/_authenticated/estabelecimento/")({
  component: DashboardPage,
});

type KPI = {
  pedidosHoje: number;
  aguardando: number;
  emPreparo: number;
  faturamentoHoje: number;
  ticketMedio: number;
  cancelados: number;
  avaliacaoMedia: number;
  estoqueBaixo: number;
};

function DashboardPage() {
  const { estab } = useMyEstab();
  const [k, setK] = useState<KPI | null>(null);

  useEffect(() => {
    if (!estab) return;
    (async () => {
      const startDay = new Date();
      startDay.setHours(0, 0, 0, 0);
      const { data: orders } = await supabase
        .from("orders")
        .select("status,total_cents,created_at")
        .eq("establishment_id", estab.id)
        .gte("created_at", startDay.toISOString());
      const list = orders ?? [];
      const faturamento = list
        .filter((o) => o.status === "delivered")
        .reduce((s, o) => s + (o.total_cents ?? 0), 0);
      const aguardando = list.filter((o) => o.status === "placed").length;
      const emPreparo = list.filter((o) => ["accepted", "preparing"].includes(o.status)).length;
      const cancelados = list.filter((o) => o.status === "cancelled").length;
      const entregues = list.filter((o) => o.status === "delivered");
      const ticket = entregues.length ? faturamento / entregues.length : 0;

      const { data: revs } = await supabase
        .from("reviews")
        .select("rating_loja")
        .eq("establishment_id", estab.id);
      const media = revs?.length
        ? revs.reduce((s, r) => s + (r.rating_loja ?? 0), 0) / revs.length
        : 0;

      const { count: baixo } = await supabase
        .from("products")
        .select("id", { head: true, count: "exact" })
        .eq("establishment_id", estab.id)
        .lte("estoque", 5)
        .not("estoque", "is", null);

      setK({
        pedidosHoje: list.length,
        aguardando,
        emPreparo,
        faturamentoHoje: faturamento,
        ticketMedio: ticket,
        cancelados,
        avaliacaoMedia: media,
        estoqueBaixo: baixo ?? 0,
      });
    })();
  }, [estab?.id]);

  if (!estab || !k)
    return <div className="text-sm text-muted-foreground">Carregando dashboard…</div>;

  const cards = [
    { icon: ShoppingBag, label: "Pedidos hoje", value: k.pedidosHoje, color: "text-primary" },
    { icon: Clock, label: "Aguardando ação", value: k.aguardando, color: "text-amber-500" },
    { icon: TrendingUp, label: "Em preparo", value: k.emPreparo, color: "text-blue-500" },
    {
      icon: DollarSign,
      label: "Faturamento hoje",
      value: fmt(k.faturamentoHoje),
      color: "text-emerald-500",
    },
    {
      icon: DollarSign,
      label: "Ticket médio",
      value: fmt(Math.round(k.ticketMedio)),
      color: "text-emerald-500",
    },
    { icon: AlertTriangle, label: "Cancelados", value: k.cancelados, color: "text-destructive" },
    { icon: Star, label: "Avaliação", value: k.avaliacaoMedia.toFixed(1), color: "text-amber-500" },
    {
      icon: AlertTriangle,
      label: "Estoque baixo",
      value: k.estoqueBaixo,
      color: "text-orange-500",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Bem-vindo, {estab.nome}</h1>
        <p className="text-sm text-muted-foreground">Resumo da operação em tempo real.</p>
      </div>
      {!estab.is_open && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            Sua loja está fechada. Ative o botão no topo para começar a receber pedidos.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                {c.label}
                <c.icon className={`h-4 w-4 ${c.color}`} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-black">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <ScoreCard entityType="establishment" entityId={estab.id} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-sm">Status da loja</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <Badge variant={estab.is_open ? "default" : "secondary"}>
                {estab.is_open ? "Aberta" : "Fechada"}
              </Badge>
            </p>
            <p className="text-muted-foreground">
              Taxa de entrega:{" "}
              <span className="font-semibold">{fmt(estab.taxa_entrega_cents)}</span>
            </p>
            <p className="text-muted-foreground">
              Pedido mínimo: <span className="font-semibold">{fmt(estab.pedido_minimo_cents)}</span>
            </p>
            <p className="text-muted-foreground">
              Tempo médio: <span className="font-semibold">{estab.tempo_medio_min ?? 30} min</span>
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-sm">Dicas rápidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              • Cadastre horários de funcionamento em <b>Horários</b>.
            </p>
            <p>• Configure sua área de entrega para receber mais pedidos.</p>
            <p>• Adicione fotos aos produtos — aumenta a conversão em até 40%.</p>
            <p>• Responda as avaliações para fidelizar clientes.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
