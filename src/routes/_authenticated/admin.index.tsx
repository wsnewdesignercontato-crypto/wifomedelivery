import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  ShoppingBag,
  DollarSign,
  Users,
  Store,
  Bike,
  Clock,
  TrendingUp,
  XCircle,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { KpiCard } from "@/components/admin/kpi-card";
import { brl, num, dateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboard,
});

type Order = {
  id: string;
  status: string;
  total_cents: number;
  created_at: string;
  establishment_id: string | null;
  cancelled_at: string | null;
};

const ACTIVE_STATUSES = [
  "placed",
  "accepted",
  "preparing",
  "ready",
  "waiting_courier",
  "courier_assigned",
  "picked_up",
  "on_the_way",
  "arriving",
];

async function fetchOverview() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - 7);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const start30 = new Date();
  start30.setDate(start30.getDate() - 29);
  start30.setHours(0, 0, 0, 0);

  const [ordersMonthRes, clientesRes, estabsRes, couriersOnlineRes, couriersRes] =
    await Promise.all([
      supabase
        .from("orders")
        .select("id,status,total_cents,created_at,establishment_id,cancelled_at")
        .gte("created_at", start30.toISOString())
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("establishments").select("id,nome,aberto,status", { count: "exact" }),
      supabase
        .from("courier_profiles")
        .select("id", { count: "exact", head: true })
        .eq("status", "online"),
      supabase.from("courier_profiles").select("id", { count: "exact", head: true }),
    ]);

  const orders = (ordersMonthRes.data ?? []) as Order[];
  const clientesTotal = clientesRes.count ?? 0;
  const estabsTotal = estabsRes.count ?? 0;
  const estabsAbertos =
    (estabsRes.data ?? []).filter((e: { aberto: boolean }) => e.aberto).length;
  const entregadoresOnline = couriersOnlineRes.count ?? 0;
  const entregadoresTotal = couriersRes.count ?? 0;

  const inRange = (o: Order, since: Date) => new Date(o.created_at) >= since;
  const revenue = (list: Order[]) =>
    list
      .filter((o) => o.status === "delivered")
      .reduce((sum, o) => sum + (o.total_cents ?? 0), 0);

  const today = orders.filter((o) => inRange(o, startOfDay));
  const week = orders.filter((o) => inRange(o, startOfWeek));
  const month = orders.filter((o) => inRange(o, startOfMonth));

  const deliveredMonth = month.filter((o) => o.status === "delivered");
  const cancelledMonth = month.filter((o) => o.status === "cancelled");
  const activeNow = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));

  const ticketMedio = deliveredMonth.length
    ? Math.round(revenue(deliveredMonth) / deliveredMonth.length)
    : 0;

  // 14-day series
  const days: { day: string; pedidos: number; receita: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const dayOrders = orders.filter((o) => {
      const t = new Date(o.created_at).getTime();
      return t >= d.getTime() && t < next.getTime();
    });
    days.push({
      day: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      pedidos: dayOrders.length,
      receita: revenue(dayOrders) / 100,
    });
  }

  // Status pie
  const statusCount: Record<string, number> = {};
  month.forEach((o) => {
    statusCount[o.status] = (statusCount[o.status] ?? 0) + 1;
  });
  const statusData = Object.entries(statusCount).map(([status, value]) => ({
    status,
    value,
  }));

  // Top estabelecimentos (by delivered orders this month)
  const estabsById = new Map<string, string>(
    ((estabsRes.data ?? []) as { id: string; nome: string }[]).map((e) => [e.id, e.nome]),
  );
  const topMap = new Map<string, { nome: string; pedidos: number; receita: number }>();
  deliveredMonth.forEach((o) => {
    if (!o.establishment_id) return;
    const nome = estabsById.get(o.establishment_id) ?? "—";
    const cur = topMap.get(o.establishment_id) ?? { nome, pedidos: 0, receita: 0 };
    cur.pedidos += 1;
    cur.receita += o.total_cents;
    topMap.set(o.establishment_id, cur);
  });
  const topEstabs = Array.from(topMap.values())
    .sort((a, b) => b.pedidos - a.pedidos)
    .slice(0, 5);

  return {
    kpis: {
      pedidosHoje: today.length,
      pedidosSemana: week.length,
      pedidosMes: month.length,
      pedidosAtivos: activeNow.length,
      pedidosCancelados: cancelledMonth.length,
      pedidosEntregues: deliveredMonth.length,
      receitaHoje: revenue(today),
      receitaSemana: revenue(week),
      receitaMes: revenue(deliveredMonth),
      ticketMedio,
      clientesTotal,
      estabsTotal,
      estabsAbertos,
      entregadoresOnline,
      entregadoresTotal,
    },
    days,
    statusData,
    topEstabs,
    recent: orders.slice(0, 8),
  };
}

const STATUS_COLORS = ["#FF6B00", "#10B981", "#F59E0B", "#EF4444", "#6366F1", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];

const STATUS_LABEL: Record<string, string> = {
  placed: "Recebido",
  accepted: "Aceito",
  preparing: "Preparando",
  ready: "Pronto",
  waiting_courier: "Aguardando courier",
  courier_assigned: "Courier atribuído",
  picked_up: "Coletado",
  on_the_way: "A caminho",
  arriving: "Chegando",
  delivered: "Entregue",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  awaiting_payment: "Aguard. pagamento",
};

function AdminDashboard() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: fetchOverview,
    refetchInterval: 30000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("admin-orders-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        refetch();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [refetch]);

  const k = data?.kpis;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visão executiva da plataforma em tempo real.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Pedidos hoje"
          value={num(k?.pedidosHoje ?? 0)}
          hint={`${num(k?.pedidosAtivos ?? 0)} em andamento`}
          icon={ShoppingBag}
          tone="primary"
          loading={isLoading}
        />
        <KpiCard
          label="Faturamento hoje"
          value={brl(k?.receitaHoje ?? 0)}
          hint={`Mês: ${brl(k?.receitaMes ?? 0)}`}
          icon={DollarSign}
          tone="success"
          loading={isLoading}
        />
        <KpiCard
          label="Ticket médio"
          value={brl(k?.ticketMedio ?? 0)}
          hint={`${num(k?.pedidosEntregues ?? 0)} entregues no mês`}
          icon={TrendingUp}
          loading={isLoading}
        />
        <KpiCard
          label="Cancelados (mês)"
          value={num(k?.pedidosCancelados ?? 0)}
          icon={XCircle}
          tone="danger"
          loading={isLoading}
        />
        <KpiCard
          label="Clientes cadastrados"
          value={num(k?.clientesTotal ?? 0)}
          icon={Users}
          loading={isLoading}
        />
        <KpiCard
          label="Estabelecimentos"
          value={num(k?.estabsTotal ?? 0)}
          hint={`${num(k?.estabsAbertos ?? 0)} abertos agora`}
          icon={Store}
          tone="primary"
          loading={isLoading}
        />
        <KpiCard
          label="Entregadores online"
          value={num(k?.entregadoresOnline ?? 0)}
          hint={`de ${num(k?.entregadoresTotal ?? 0)} cadastrados`}
          icon={Bike}
          tone="success"
          loading={isLoading}
        />
        <KpiCard
          label="Pedidos semana"
          value={num(k?.pedidosSemana ?? 0)}
          icon={Clock}
          loading={isLoading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Últimos 14 dias</h2>
            <span className="text-xs text-muted-foreground">Pedidos & receita</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.days ?? []}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF6B00" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#FF6B00" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="day" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="pedidos"
                  stroke="#FF6B00"
                  strokeWidth={2}
                  fill="url(#g1)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Status (mês)</h2>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data?.statusData ?? []}
                  dataKey="value"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {(data?.statusData ?? []).map((_, i) => (
                    <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number, n: string) => [num(v), STATUS_LABEL[n] ?? n]}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Top estabelecimentos</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.topEstabs ?? []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis
                  type="category"
                  dataKey="nome"
                  width={110}
                  fontSize={11}
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="pedidos" fill="#FF6B00" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Pedidos recentes</h2>
          <div className="space-y-2">
            {isLoading && (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            )}
            {(data?.recent ?? []).map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      #{o.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-muted-foreground">{dateTime(o.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                    {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                  <span className="font-semibold tabular-nums">{brl(o.total_cents)}</span>
                </div>
              </div>
            ))}
            {!isLoading && (data?.recent ?? []).length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum pedido ainda.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
