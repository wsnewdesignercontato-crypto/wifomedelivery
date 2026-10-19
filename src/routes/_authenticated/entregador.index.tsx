import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Bike,
  MapPin,
  Package,
  CheckCircle2,
  DollarSign,
  Timer,
  Star,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { transitionCourierDelivery } from "@/lib/courier-delivery-transition";
import { bindResumeRefresh } from "@/lib/resume-refresh";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useMyCourier, fmt } from "@/hooks/use-courier";
import { ScoreCard } from "@/components/score-card";
import { useQueryClient } from "@tanstack/react-query";
import {
  canCourierAccessRides,
  canCourierGoOnline,
  getCourierApprovalLabel,
} from "@/lib/courier-approval";

export const Route = createFileRoute("/_authenticated/entregador/")({
  head: () => ({
    meta: [
      { title: "Entregador — Início | PedeTrem" },
      { name: "description", content: "PedeTrem: entregador, início." },
      { property: "og:title", content: "Entregador — Início | PedeTrem" },
      { property: "og:description", content: "PedeTrem: entregador, início." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

type Delivery = {
  is_test?: boolean;
  id: string;
  order_id: string;
  status: string;
  valor_entrega_cents: number;
  entregador_id: string | null;
};
type OrderLite = {
  id: string;
  establishment_id: string;
  total_cents: number;
  endereco_entrega: { endereco?: string } | null;
};
type Estab = { id: string; nome: string; endereco: string | null; cidade: string | null };

const DELIV_LABEL: Record<string, string> = {
  broadcasting: "Disponível",
  accepted: "Aceita",
  to_store: "A caminho da loja",
  at_store: "Na loja",
  picked_up: "Coletado",
  to_customer: "A caminho do cliente",
  at_customer: "No cliente",
  delivered: "Entregue",
  cancelled: "Cancelada",
};

function Home() {
  const { courier } = useMyCourier();
  const qc = useQueryClient();
  const canGoOnline = canCourierGoOnline(courier);
  const canReceiveRides = canCourierAccessRides(courier);
  const [online, setOnline] = useState(
    courier?.status === "online" || courier?.status === "ocupado",
  );
  const [ativa, setAtiva] = useState<Delivery | null>(null);
  const [order, setOrder] = useState<OrderLite | null>(null);
  const [estab, setEstab] = useState<Estab | null>(null);
  const [disponiveis, setDisponiveis] = useState<Delivery[]>([]);
  const [stats, setStats] = useState({ hoje: 0, entregas: 0, saldo: 0, nota: 0 });
  const detailsOrderIdRef = useRef<string | null>(null);
  const refreshLifetime = useRef<{
    active: boolean;
    courierId: string;
    statsSequence: number;
    activeSequence: number;
    availableSequence: number;
  } | null>(null);

  async function loadStats() {
    const lifetime = refreshLifetime.current;
    if (!courier || !lifetime?.active || lifetime.courierId !== courier.user_id) return;
    const request = ++lifetime.statsSequence;
    const isCurrent = () =>
      lifetime.active && refreshLifetime.current === lifetime && request === lifetime.statsSequence;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data: hoje, error: todayError } = await supabase
      .from("deliveries")
      .select("valor_entrega_cents,is_test")
      .eq("is_test", false)
      .eq("entregador_id", courier.user_id)
      .eq("status", "delivered")
      .gte("entregue_em", start.toISOString());
    if (!isCurrent() || todayError) return;
    const soma = (hoje ?? []).reduce(
      (s, d: { valor_entrega_cents: number }) => s + (d.valor_entrega_cents ?? 0),
      0,
    );
    const { data: ledger, error: ledgerError } = await supabase
      .from("platform_ledger")
      .select("courier_payout_cents,status")
      .eq("courier_id", courier.user_id);
    if (!isCurrent() || ledgerError) return;
    const saldo = (ledger ?? [])
      .filter((l: { status: string }) => l.status === "pending")
      .reduce((s, l: { courier_payout_cents: number }) => s + (l.courier_payout_cents ?? 0), 0);
    const { data: myDeliv, error: deliveriesError } = await supabase
      .from("deliveries")
      .select("order_id,is_test")
      .eq("is_test", false)
      .eq("entregador_id", courier.user_id)
      .eq("status", "delivered");
    if (!isCurrent() || deliveriesError) return;
    const orderIds = (myDeliv ?? []).map((d: { order_id: string }) => d.order_id);
    let nota = Number(courier.avaliacao ?? 0);
    if (orderIds.length) {
      const { data: revs, error: reviewsError } = await supabase
        .from("reviews")
        .select("rating_entregador")
        .in("order_id", orderIds)
        .not("rating_entregador", "is", null);
      if (!isCurrent() || reviewsError) return;
      const arr = (revs ?? [])
        .map((r: { rating_entregador: number | null }) => r.rating_entregador ?? 0)
        .filter((n: number) => n > 0);
      if (arr.length) nota = arr.reduce((s: number, n: number) => s + n, 0) / arr.length;
    }
    setStats({ hoje: soma, entregas: (hoje ?? []).length, saldo, nota });
  }

  async function loadAtiva() {
    const lifetime = refreshLifetime.current;
    if (!courier || !lifetime?.active || lifetime.courierId !== courier.user_id) return;
    const request = ++lifetime.activeSequence;
    const isCurrent = () =>
      lifetime.active &&
      refreshLifetime.current === lifetime &&
      request === lifetime.activeSequence;
    const { data, error } = await supabase
      .from("deliveries")
      .select("id,order_id,status,valor_entrega_cents,entregador_id,is_test")
      .eq("entregador_id", courier.user_id)
      .not("status", "in", "(delivered,cancelled)")
      .maybeSingle();
    if (!isCurrent() || error) return;
    const nextOrderId = data?.order_id ?? null;
    if (detailsOrderIdRef.current !== nextOrderId) {
      detailsOrderIdRef.current = nextOrderId;
      setOrder(null);
      setEstab(null);
    }
    if (!data) {
      setAtiva(null);
      setOrder(null);
      setEstab(null);
      return;
    }
    setAtiva(data as Delivery);
    const { data: o, error: orderError } = await supabase
      .from("orders")
      .select("id,establishment_id,total_cents,endereco_entrega,is_test")
      .eq("id", data.order_id)
      .maybeSingle();
    if (!isCurrent() || orderError) return;
    if (o) {
      setOrder(o as OrderLite);
      const { data: e, error: storeError } = await supabase
        .from("establishments")
        .select("id,nome,endereco,cidade")
        .eq("id", o.establishment_id)
        .maybeSingle();
      if (!isCurrent() || storeError) return;
      setEstab((e as Estab) ?? null);
    } else {
      setOrder(null);
      setEstab(null);
    }
  }

  async function loadDisponiveis() {
    const lifetime = refreshLifetime.current;
    if (!courier || !lifetime?.active || lifetime.courierId !== courier.user_id) return;
    const request = ++lifetime.availableSequence;
    if (!canReceiveRides) {
      setDisponiveis([]);
      return;
    }

    const { data, error } = await supabase
      .from("deliveries")
      .select("id,order_id,status,valor_entrega_cents,entregador_id,is_test")
      .eq("status", "broadcasting")
      .order("created_at", { ascending: false })
      .limit(10);
    if (
      !lifetime.active ||
      refreshLifetime.current !== lifetime ||
      request !== lifetime.availableSequence ||
      error
    )
      return;
    setDisponiveis((data ?? []) as Delivery[]);
  }

  useEffect(() => {
    setOnline(courier?.status === "online" || courier?.status === "ocupado");
  }, [courier?.status]);

  useEffect(() => {
    if (refreshLifetime.current?.courierId !== courier?.user_id) {
      detailsOrderIdRef.current = null;
      setAtiva(null);
      setOrder(null);
      setEstab(null);
      setDisponiveis([]);
      setStats({ hoje: 0, entregas: 0, saldo: 0, nota: 0 });
    }
    if (!courier) return;
    const lifetime = {
      active: true,
      courierId: courier.user_id,
      statsSequence: 0,
      activeSequence: 0,
      availableSequence: 0,
    };
    refreshLifetime.current = lifetime;
    const refresh = async () => {
      if (!lifetime.active) return;
      await Promise.all([
        loadStats(),
        loadAtiva(),
        online && canReceiveRides ? loadDisponiveis() : Promise.resolve(setDisponiveis([])),
      ]);
    };
    void refresh();
    const unbindResume = bindResumeRefresh(refresh);
    const ch = supabase
      .channel("courier-home")
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, refresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refresh();
      });
    return () => {
      lifetime.active = false;
      unbindResume();
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courier?.user_id, online, canReceiveRides]);

  async function toggleOnline(v: boolean) {
    if (!courier) return;
    if (v && !canGoOnline) {
      setOnline(false);
      toast.error("Seu cadastro ainda está em análise e não pode ficar online.");
      return;
    }
    setOnline(v);
    await supabase
      .from("courier_profiles")
      .update({ status: v ? "online" : "offline", last_seen: new Date().toISOString() })
      .eq("user_id", courier.user_id);
    qc.invalidateQueries({ queryKey: ["courier", courier.user_id] });
  }

  async function aceitar(d: Delivery) {
    if (!courier) return;
    if (!canReceiveRides) {
      return toast.error("Seu cadastro ainda não foi aprovado para receber corridas.");
    }
    try {
      await transitionCourierDelivery(d.id, "accepted");
    } catch {
      loadAtiva();
      loadDisponiveis();
      return toast.error("Corrida indisponível");
    }
    toast.success("Corrida aceita!");
    loadAtiva();
    loadDisponiveis();
  }

  async function avancar(
    next: "to_store" | "at_store" | "picked_up" | "to_customer" | "at_customer",
  ) {
    if (!ativa || !courier) return;
    try {
      await transitionCourierDelivery(ativa.id, next);
    } catch {
      toast.error("Falha ao atualizar");
    } finally {
      loadAtiva();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-brand text-primary-foreground">
            <Bike className="h-6 w-6" />
          </div>
          <div>
            <p className="font-bold">Você está {online ? "Online" : "Offline"}</p>
            <p className="text-xs text-muted-foreground">
              {online
                ? "Recebendo corridas em tempo real"
                : canGoOnline
                  ? "Ative para começar a receber"
                  : "Aguardando aprovação do cadastro"}
            </p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">
              {getCourierApprovalLabel(courier)}
            </p>
          </div>
        </div>
        <Switch
          checked={online}
          onCheckedChange={toggleOnline}
          disabled={!canGoOnline && !online}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={DollarSign} label="Ganhos hoje" value={fmt(stats.hoje)} />
        <StatCard icon={Package} label="Entregas hoje" value={String(stats.entregas)} />
        <StatCard icon={Wallet} label="Saldo pendente" value={fmt(stats.saldo)} />
        <StatCard icon={Star} label="Nota" value={stats.nota ? stats.nota.toFixed(2) : "—"} />
      </div>

      <ScoreCard entityType="courier" entityId={courier?.user_id ?? ""} />

      {ativa && (
        <div className="rounded-2xl border-2 border-primary bg-card p-4 shadow-brand">
          <div className="flex items-center justify-between">
            <Badge className="bg-primary text-primary-foreground">Corrida ativa</Badge>
            <span className="font-bold text-primary">{fmt(ativa.valor_entrega_cents)}</span>
          </div>
          {order && estab && (
            <div className="mt-3 space-y-2 text-sm">
              <p className="flex items-start gap-2">
                <Package className="mt-0.5 h-4 w-4 text-primary" />
                <span>
                  <strong>Loja:</strong> {estab.nome}
                  {estab.endereco && ` — ${estab.endereco}`}
                </span>
              </p>
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                <span>
                  <strong>Cliente:</strong> {order.endereco_entrega?.endereco ?? "—"}
                </span>
              </p>
            </div>
          )}
          <p className="mt-3 mb-2 text-xs font-medium text-muted-foreground">
            Status: {DELIV_LABEL[ativa.status] ?? ativa.status}
          </p>
          <div className="flex flex-wrap gap-2">
            {ativa.status === "accepted" && (
              <Button size="sm" onClick={() => avancar("to_store")}>
                A caminho da loja
              </Button>
            )}
            {ativa.status === "to_store" && (
              <Button size="sm" onClick={() => avancar("at_store")}>
                Cheguei na loja
              </Button>
            )}
            {ativa.status === "at_store" && (
              <Button size="sm" onClick={() => avancar("picked_up")}>
                Pedido coletado
              </Button>
            )}
            {ativa.status === "picked_up" && (
              <Button size="sm" onClick={() => avancar("to_customer")}>
                A caminho do cliente
              </Button>
            )}
            {ativa.status === "to_customer" && (
              <Button size="sm" onClick={() => avancar("at_customer")}>
                Cheguei no cliente
              </Button>
            )}
            {ativa.status === "at_customer" && (
              <Link to="/entregador/corridas">
                <Button size="sm">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Finalizar com código do cliente
                </Button>
              </Link>
            )}
          </div>
          {ativa.status === "at_customer" && (
            <p className="mt-2 text-xs font-semibold text-primary">
              Para finalizar, peça o código de 4 dígitos ao cliente na tela "Corridas".
            </p>
          )}
        </div>
      )}

      {!ativa && online && canReceiveRides && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Corridas disponíveis ({disponiveis.length})
            </h2>
            <Link
              to="/entregador/corridas"
              className="text-xs text-primary underline-offset-2 hover:underline"
            >
              Ver todas
            </Link>
          </div>
          <div className="space-y-3">
            {disponiveis.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
                <Bike className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">Nenhuma corrida no momento.</p>
              </div>
            )}
            {disponiveis.slice(0, 5).map((d) => (
              <div key={d.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">Nova corrida disponível</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <Timer className="h-3 w-3" /> Aceite antes que outro entregador
                    </p>
                  </div>
                  <span className="font-bold text-primary">{fmt(d.valor_entrega_cents)}</span>
                </div>
                <Button className="mt-3 w-full" onClick={() => aceitar(d)}>
                  Aceitar corrida
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!online && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <TrendingUp className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {canGoOnline
              ? "Fique online para receber corridas."
              : "Seu cadastro ainda está em análise."}
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({
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
