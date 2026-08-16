import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Bike,
  CheckCircle2,
  DollarSign,
  Loader2,
  MapPin,
  Package,
  Route as RouteIcon,
  ShieldCheck,
  Star,
  Timer,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import promoEntregador from "@/assets/promo-entregador.jpg";
import { ScoreCard } from "@/components/score-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useMyCourier, fmt } from "@/hooks/use-courier";
import {
  canCourierAccessRides,
  canCourierGoOnline,
  getCourierApprovalLabel,
} from "@/lib/courier-approval";

export const Route = createFileRoute("/_authenticated/entregador/")({
  component: Home,
});

type Delivery = {
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
  broadcasting: "Disponivel",
  accepted: "Aceita",
  to_store: "A caminho da loja",
  at_store: "Na loja",
  picked_up: "Coletado",
  to_customer: "A caminho do cliente",
  at_customer: "No cliente",
  delivered: "Entregue",
  cancelled: "Cancelada",
};

const FLOW = [
  { key: "accepted", label: "Aceita" },
  { key: "to_store", label: "Loja" },
  { key: "at_store", label: "Chegada" },
  { key: "picked_up", label: "Coleta" },
  { key: "to_customer", label: "Rota" },
  { key: "at_customer", label: "Cliente" },
] as const;

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

  async function loadStats() {
    if (!courier) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data: hoje } = await supabase
      .from("deliveries")
      .select("valor_entrega_cents")
      .eq("entregador_id", courier.user_id)
      .eq("status", "delivered")
      .gte("entregue_em", start.toISOString());
    const soma = (hoje ?? []).reduce(
      (s, d: { valor_entrega_cents: number }) => s + (d.valor_entrega_cents ?? 0),
      0,
    );
    const { data: ledger } = await supabase
      .from("platform_ledger")
      .select("courier_payout_cents,status")
      .eq("courier_id", courier.user_id);
    const saldo = (ledger ?? [])
      .filter((l: { status: string }) => l.status === "pending")
      .reduce((s, l: { courier_payout_cents: number }) => s + (l.courier_payout_cents ?? 0), 0);
    const { data: myDeliv } = await supabase
      .from("deliveries")
      .select("order_id")
      .eq("entregador_id", courier.user_id)
      .eq("status", "delivered");
    const orderIds = (myDeliv ?? []).map((d: { order_id: string }) => d.order_id);
    let nota = Number(courier.avaliacao ?? 0);
    if (orderIds.length) {
      const { data: revs } = await supabase
        .from("reviews")
        .select("rating_entregador")
        .in("order_id", orderIds)
        .not("rating_entregador", "is", null);
      const arr = (revs ?? [])
        .map((r: { rating_entregador: number | null }) => r.rating_entregador ?? 0)
        .filter((n: number) => n > 0);
      if (arr.length) nota = arr.reduce((s: number, n: number) => s + n, 0) / arr.length;
    }
    setStats({ hoje: soma, entregas: (hoje ?? []).length, saldo, nota });
  }

  async function loadAtiva() {
    if (!courier) return;
    const { data } = await supabase
      .from("deliveries")
      .select("id,order_id,status,valor_entrega_cents,entregador_id")
      .eq("entregador_id", courier.user_id)
      .not("status", "in", "(delivered,cancelled)")
      .maybeSingle();
    if (!data) {
      setAtiva(null);
      setOrder(null);
      setEstab(null);
      return;
    }
    setAtiva(data as Delivery);
    const { data: o } = await supabase
      .from("orders")
      .select("id,establishment_id,total_cents,endereco_entrega")
      .eq("id", data.order_id)
      .maybeSingle();
    if (o) {
      setOrder(o as OrderLite);
      const { data: e } = await supabase
        .from("establishments")
        .select("id,nome,endereco,cidade")
        .eq("id", o.establishment_id)
        .maybeSingle();
      if (e) setEstab(e as Estab);
    }
  }

  async function loadDisponiveis() {
    if (!canReceiveRides) {
      setDisponiveis([]);
      return;
    }

    const { data } = await supabase
      .from("deliveries")
      .select("id,order_id,status,valor_entrega_cents,entregador_id")
      .eq("status", "broadcasting")
      .order("created_at", { ascending: false })
      .limit(10);
    setDisponiveis((data ?? []) as Delivery[]);
  }

  const refreshHome = useEffectEvent(() => {
    if (!courier) return;
    void loadStats();
    void loadAtiva();
    if (online && canReceiveRides) void loadDisponiveis();
    else setDisponiveis([]);
  });

  useEffect(() => {
    if (!courier) return;
    refreshHome();
    const ch = supabase
      .channel("courier-home")
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => {
        refreshHome();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [courier, online, refreshHome]);

  useEffect(() => {
    setOnline(courier?.status === "online" || courier?.status === "ocupado");
  }, [courier?.status]);

  async function toggleOnline(v: boolean) {
    if (!courier) return;
    if (v && !canGoOnline) {
      setOnline(false);
      toast.error("Seu cadastro ainda esta em analise e nao pode ficar online.");
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
      return toast.error("Seu cadastro ainda nao foi aprovado para receber corridas.");
    }
    const { data, error } = await supabase
      .from("deliveries")
      .update({
        entregador_id: courier.user_id,
        status: "accepted",
        aceito_em: new Date().toISOString(),
      })
      .eq("id", d.id)
      .eq("status", "broadcasting")
      .select("*")
      .maybeSingle();
    if (error || !data) return toast.error("Corrida ja foi aceita por outro entregador");
    await supabase.from("orders").update({ status: "courier_assigned" }).eq("id", d.order_id);
    await supabase
      .from("courier_profiles")
      .update({ status: "ocupado" })
      .eq("user_id", courier.user_id);
    toast.success("Corrida aceita!");
    loadAtiva();
    loadDisponiveis();
  }

  async function avancar(
    next: "to_store" | "at_store" | "picked_up" | "to_customer" | "at_customer",
  ) {
    if (!ativa || !courier) return;
    const patch: Record<string, unknown> = { status: next };
    if (next === "picked_up") patch.coletado_em = new Date().toISOString();
    await supabase
      .from("deliveries")
      .update(patch as never)
      .eq("id", ativa.id);
    const orderMap: Record<string, string> = {
      to_store: "courier_assigned",
      picked_up: "picked_up",
      to_customer: "on_the_way",
      at_customer: "arriving",
    };
    if (orderMap[next]) {
      await supabase
        .from("orders")
        .update({ status: orderMap[next] as never })
        .eq("id", ativa.order_id);
    }
    loadAtiva();
  }

  const cityLabel = useMemo(() => {
    if (courier?.cidade_atuacao) return courier.cidade_atuacao;
    if (courier?.cidades_atuacao?.length) return courier.cidades_atuacao[0];
    return "Sua regiao";
  }, [courier?.cidade_atuacao, courier?.cidades_atuacao]);

  const acceptance =
    courier?.aceitacao_pct != null ? `${Math.round(courier.aceitacao_pct)}%` : "--";
  const cancelRate =
    courier?.cancelamento_pct != null ? `${Math.round(courier.cancelamento_pct)}%` : "--";
  const totalDeliveries =
    courier?.entregas_total != null ? String(courier.entregas_total) : String(stats.entregas);

  if (!courier) {
    return (
      <div className="card-premium rounded-[1.75rem] p-6">
        <h1 className="text-2xl font-black tracking-tight">Complete seu perfil de entregador</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Assim que seus dados forem aprovados, voce passa a receber corridas, acompanhar ganhos e
          operar no app premium.
        </p>
        <div className="mt-4">
          <Link
            to="/entregador/perfil"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-brand"
          >
            Finalizar cadastro
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="card-premium relative overflow-hidden border-none bg-gradient-to-br from-primary/12 via-white to-primary/5 p-5 dark:from-primary/15 dark:via-card dark:to-primary/10 sm:p-6">
        <div className="absolute -left-12 top-0 h-36 w-36 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -right-10 bottom-0 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative grid gap-6 xl:grid-cols-[1.05fr_0.95fr] xl:items-center">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary text-primary-foreground">
                Painel premium do entregador
              </Badge>
              <Badge variant="outline" className={statusTone(courier.status)}>
                {courier.status}
              </Badge>
              <span className="text-xs font-semibold text-muted-foreground">{cityLabel}</span>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[1.5rem] bg-primary/10 text-primary shadow-sm ring-1 ring-primary/15">
                  {courier.foto_url ? (
                    <img
                      src={courier.foto_url}
                      alt="Foto do entregador"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Bike className="h-7 w-7" />
                  )}
                </div>
                <div>
                  <h1 className="text-3xl font-black tracking-tight text-foreground">
                    Pronto para rodar com mais controle.
                  </h1>
                  <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                    Acompanhe seu status, aceite corridas mais rapido e tenha uma leitura premium
                    dos seus ganhos e da sua performance.
                  </p>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/70 bg-white/85 p-4 shadow-sm dark:border-border dark:bg-card/85">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Recebendo corridas
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <Switch
                    checked={online}
                    onCheckedChange={toggleOnline}
                    disabled={!canGoOnline && !online}
                  />
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      {online ? "Voce esta online" : "Voce esta offline"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {online
                        ? "Ofertas em tempo real habilitadas"
                        : canGoOnline
                          ? "Ative para voltar a receber"
                          : "Aguardando aprovacao do cadastro"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <HeroMetric
                label="Entregas totais"
                value={totalDeliveries}
                hint="Historico consolidado"
              />
              <HeroMetric label="Aceitacao" value={acceptance} hint="Taxa de aceite" />
              <HeroMetric label="Cancelamento" value={cancelRate} hint="Quanto menor, melhor" />
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                to="/entregador/corridas"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-brand"
              >
                Ver corridas
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/entregador/ganhos"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-white/80 px-4 py-2.5 text-sm font-semibold text-foreground hover:border-primary/40 hover:text-primary dark:bg-card/80"
              >
                Ganhos detalhados
              </Link>
              <Link
                to="/entregador/perfil"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-white/80 px-4 py-2.5 text-sm font-semibold text-foreground hover:border-primary/40 hover:text-primary dark:bg-card/80"
              >
                Perfil e documentos
              </Link>
            </div>

            <div className="flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1.5 shadow-sm dark:bg-card/80">
                <Bike className="h-3.5 w-3.5 text-primary" />
                {courier.veiculo ?? "Veiculo ainda nao informado"}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1.5 shadow-sm dark:bg-card/80">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                {getCourierApprovalLabel(courier)}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1.5 shadow-sm dark:bg-card/80">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                Atendendo {cityLabel}
              </span>
            </div>
          </div>

          <div className="relative hidden min-h-[320px] xl:block">
            <div className="absolute inset-y-6 left-12 right-0 rounded-[2rem] bg-primary/10 blur-3xl" />
            <img
              src={promoEntregador}
              alt="Painel premium do entregador"
              className="relative ml-auto h-full max-h-[360px] w-full max-w-[500px] rounded-[2rem] object-cover shadow-brand"
            />
            <div className="absolute left-0 top-8 w-56 rounded-[1.5rem] border border-white/70 bg-white/90 p-4 shadow-card backdrop-blur dark:border-border dark:bg-card/90">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                Ganhos do dia
              </p>
              <p className="mt-2 text-2xl font-black text-foreground">{fmt(stats.hoje)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Resumo rapido para decidir o melhor ritmo de corridas.
              </p>
            </div>
            <div className="absolute -bottom-2 right-4 w-56 rounded-[1.5rem] border border-primary/15 bg-card/95 p-4 shadow-card">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                Rota com mais clareza
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Loja, cliente, status e proximo passo organizados em uma tela mais limpa.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={DollarSign}
          label="Ganhos hoje"
          value={fmt(stats.hoje)}
          hint="Desde meia-noite"
        />
        <StatCard
          icon={Package}
          label="Entregas hoje"
          value={String(stats.entregas)}
          hint="Pedidos concluidos"
        />
        <StatCard
          icon={Wallet}
          label="Saldo pendente"
          value={fmt(stats.saldo)}
          hint="Aguardando repasse"
        />
        <StatCard
          icon={Star}
          label="Nota media"
          value={stats.nota ? stats.nota.toFixed(2) : "--"}
          hint="Baseada nas avaliacoes"
        />
      </div>

      <ScoreCard entityType="courier" entityId={courier.user_id} />

      {ativa ? (
        <section className="card-premium relative overflow-hidden border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Badge className="bg-primary text-primary-foreground">Corrida ativa</Badge>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-foreground">
                Uma corrida em andamento, tudo no ponto certo.
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Acompanhe o proximo passo e avance o status sem perder o contexto.
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-primary/15 bg-white/80 px-4 py-3 text-right shadow-sm dark:bg-card/80">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Ganho desta entrega
              </p>
              <p className="mt-2 text-2xl font-black text-primary">
                {fmt(ativa.valor_entrega_cents)}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-[1.5rem] border border-border bg-muted/20 p-4">
            <DeliveryTimeline status={ativa.status} />
            <p className="mt-4 text-sm font-semibold text-foreground">
              Status atual: {DELIV_LABEL[ativa.status] ?? ativa.status}
            </p>
          </div>

          {order && estab ? (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <InfoPanel
                icon={Package}
                title="Coleta na loja"
                body={estab.nome}
                detail={
                  estab.endereco
                    ? `${estab.endereco}${estab.cidade ? ` - ${estab.cidade}` : ""}`
                    : "Endereco da loja nao informado"
                }
              />
              <InfoPanel
                icon={MapPin}
                title="Entrega ao cliente"
                body={order.endereco_entrega?.endereco ?? "Endereco nao informado"}
                detail={`Pedido ${fmt(order.total_cents)}`}
              />
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
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
                  Finalizar com codigo
                </Button>
              </Link>
            )}
          </div>

          {ativa.status === "at_customer" && (
            <p className="mt-3 text-xs font-semibold text-primary">
              Peca o codigo de 4 digitos ao cliente na tela Corridas antes de concluir a entrega.
            </p>
          )}
        </section>
      ) : null}

      {!ativa && online && canReceiveRides ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-foreground">
                Corridas disponiveis
              </h2>
              <p className="text-sm text-muted-foreground">
                {disponiveis.length
                  ? `${disponiveis.length} oferta(s) em tempo real para voce avaliar.`
                  : "Nenhuma oferta no momento, mas voce segue visivel para novas corridas."}
              </p>
            </div>
            <Link
              to="/entregador/corridas"
              className="text-sm font-semibold text-primary hover:underline"
            >
              Ver painel completo
            </Link>
          </div>

          {disponiveis.length === 0 ? (
            <div className="card-premium rounded-[1.75rem] p-10 text-center">
              <TrendingUp className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-lg font-bold text-foreground">Nenhuma corrida no momento</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Continue online. Assim que uma nova corrida aparecer, ela entra aqui com destaque.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {disponiveis.slice(0, 6).map((d, index) => (
                <RideOfferCard key={d.id} delivery={d} index={index} onAccept={() => aceitar(d)} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!online ? (
        <section className="card-premium rounded-[1.75rem] border-dashed p-10 text-center">
          <RouteIcon className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-lg font-bold text-foreground">
            {canGoOnline
              ? "Ative seu modo online para voltar ao mapa de corridas"
              : "Seu cadastro ainda esta em analise"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canGoOnline
              ? "Quando voce fica online, o app libera ofertas em tempo real, leitura de desempenho e ganhos do dia."
              : "Assim que o admin aprovar seu cadastro e documentos, o app libera corridas em tempo real."}
          </p>
        </section>
      ) : null}
    </div>
  );
}

function statusTone(status: string) {
  if (status === "online") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600";
  if (status === "ocupado") return "border-primary/30 bg-primary/10 text-primary";
  if (status === "bloqueado") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-border bg-muted text-muted-foreground";
}

function HeroMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-border dark:bg-card/80">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="card-premium rounded-[1.5rem] border-none bg-gradient-to-br from-card to-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-black tracking-tight text-foreground">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function DeliveryTimeline({ status }: { status: string }) {
  const currentIndex = FLOW.findIndex((step) => step.key === status);
  const activeIndex = currentIndex === -1 ? 0 : currentIndex;

  return (
    <div className="grid gap-3 sm:grid-cols-6">
      {FLOW.map((step, index) => {
        const active = index <= activeIndex;
        return (
          <div key={step.key} className="flex items-center gap-3 sm:flex-col sm:items-start">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-black ${
                active
                  ? "bg-primary text-primary-foreground shadow-brand"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {index + 1}
            </div>
            <div>
              <p
                className={`text-sm font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}
              >
                {step.label}
              </p>
              <div
                className={`mt-1 h-1.5 w-20 rounded-full sm:w-full ${active ? "bg-primary/30" : "bg-border"}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InfoPanel({
  icon: Icon,
  title,
  body,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  detail: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-border bg-card/90 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-1 text-base font-bold text-foreground">{body}</p>
          <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function RideOfferCard({
  delivery,
  index,
  onAccept,
}: {
  delivery: Delivery;
  index: number;
  onAccept: () => void;
}) {
  return (
    <div className="card-premium rounded-[1.75rem] border-none bg-gradient-to-br from-card to-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Oferta #{index + 1}
          </p>
          <h3 className="mt-2 text-xl font-black tracking-tight text-foreground">
            Nova corrida pronta para aceite
          </h3>
          <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
            <Timer className="h-4 w-4 text-primary" />
            Aceite rapido para aumentar suas chances de manter o fluxo do dia.
          </p>
        </div>
        <div className="rounded-[1.25rem] bg-primary/10 px-3 py-2 text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Entrega</p>
          <p className="mt-1 text-xl font-black text-primary">
            {fmt(delivery.valor_entrega_cents)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
        <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5">
          <Bike className="h-3.5 w-3.5 text-primary" />
          Corrida disponivel
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5">
          <Wallet className="h-3.5 w-3.5 text-primary" />
          Pagamento por entrega
        </span>
      </div>

      <Button className="mt-4 w-full" onClick={onAccept}>
        Aceitar corrida
      </Button>
    </div>
  );
}
