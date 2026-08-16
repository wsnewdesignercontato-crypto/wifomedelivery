import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  DollarSign,
  Loader2,
  Package,
  Settings,
  ShoppingBag,
  Star,
  Store,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab, fmt } from "@/hooks/use-my-estab";
import promoEstabelecimento from "@/assets/promo-estabelecimento.jpg";
import { ScoreCard } from "@/components/score-card";
import { Badge } from "@/components/ui/badge";

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

const QUICK_ACTIONS = [
  {
    to: "/estabelecimento/pedidos",
    label: "Gerenciar pedidos",
    description: "Acompanhe fila, aceite e tempo de preparo em tempo real.",
  },
  {
    to: "/estabelecimento/produtos",
    label: "Ajustar cardapio",
    description: "Atualize itens, fotos e precos com menos friccao.",
  },
  {
    to: "/estabelecimento/horarios",
    label: "Horarios e operacao",
    description: "Defina disponibilidade e evite ficar invisivel fora do horario.",
  },
  {
    to: "/estabelecimento/entrega",
    label: "Area de entrega",
    description: "Amplie bairros atendidos e melhore a cobertura da loja.",
  },
] as const;

function DashboardPage() {
  const { estab } = useMyEstab();
  const [k, setK] = useState<KPI | null>(null);
  const estabId = estab?.id;

  useEffect(() => {
    if (!estabId) return;
    (async () => {
      const startDay = new Date();
      startDay.setHours(0, 0, 0, 0);
      const { data: orders } = await supabase
        .from("orders")
        .select("status,total_cents,created_at")
        .eq("establishment_id", estabId)
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
        .eq("establishment_id", estabId);
      const media = revs?.length
        ? revs.reduce((s, r) => s + (r.rating_loja ?? 0), 0) / revs.length
        : 0;

      const { count: baixo } = await supabase
        .from("products")
        .select("id", { head: true, count: "exact" })
        .eq("establishment_id", estabId)
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
  }, [estabId]);

  const cards = useMemo(
    () =>
      k
        ? [
            {
              icon: ShoppingBag,
              label: "Pedidos hoje",
              value: String(k.pedidosHoje),
              hint: "Tudo que entrou desde 00:00",
            },
            {
              icon: Clock,
              label: "Aguardando acao",
              value: String(k.aguardando),
              hint: "Pedidos que precisam de resposta",
            },
            {
              icon: TrendingUp,
              label: "Em preparo",
              value: String(k.emPreparo),
              hint: "Operacao em andamento agora",
            },
            {
              icon: DollarSign,
              label: "Faturamento hoje",
              value: fmt(k.faturamentoHoje),
              hint: "Receita das entregas concluidas",
            },
            {
              icon: DollarSign,
              label: "Ticket medio",
              value: fmt(Math.round(k.ticketMedio)),
              hint: "Valor medio por pedido entregue",
            },
            {
              icon: AlertTriangle,
              label: "Cancelados",
              value: String(k.cancelados),
              hint: "Sinal para revisar prazos e cardapio",
            },
            {
              icon: Star,
              label: "Avaliacao",
              value: k.avaliacaoMedia ? k.avaliacaoMedia.toFixed(1) : "--",
              hint: "Como o cliente esta percebendo a loja",
            },
            {
              icon: Package,
              label: "Estoque baixo",
              value: String(k.estoqueBaixo),
              hint: "Itens que merecem reposicao ou pausa",
            },
          ]
        : [],
    [k],
  );

  if (!estab || !k) {
    return (
      <div className="flex items-center gap-3 rounded-[1.5rem] border border-border bg-card p-5 text-sm text-muted-foreground shadow-card">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Carregando visao premium da operacao...
      </div>
    );
  }

  const healthTone =
    k.cancelados > 3 || k.estoqueBaixo > 5
      ? "atencao"
      : k.aguardando > 0 || k.emPreparo > 0
        ? "movimento"
        : "estavel";

  return (
    <div className="space-y-6">
      <section className="card-premium relative overflow-hidden border-none bg-gradient-to-br from-primary/12 via-white to-primary/5 p-5 dark:from-primary/15 dark:via-card dark:to-primary/10 sm:p-6">
        <div className="absolute -left-12 top-0 h-36 w-36 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -right-10 bottom-0 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative grid gap-6 xl:grid-cols-[1.08fr_0.92fr] xl:items-center">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary text-primary-foreground">Painel premium da loja</Badge>
              <Badge
                variant={estab.is_open ? "default" : "secondary"}
                className={estab.is_open ? "bg-emerald-500 text-white" : ""}
              >
                {estab.is_open ? "Aberta" : "Fechada"}
              </Badge>
              <span className="text-xs font-semibold text-muted-foreground">
                {estab.status === "aprovado" ? "Loja aprovada" : `Status: ${estab.status}`}
              </span>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-muted-foreground">
                {estab.cidade
                  ? `${estab.cidade}${estab.estado ? `, ${estab.estado}` : ""}`
                  : "Sua cidade"}
              </p>
              <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
                {estab.nome}, uma visao mais forte da sua operacao.
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                {estab.slogan || estab.descricao
                  ? estab.slogan || estab.descricao
                  : "Organize pedidos, cardapio, horarios e faturamento em um dashboard mais premium e mais claro para decidir rapido."}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <HeroMetric
                label="Pedidos hoje"
                value={String(k.pedidosHoje)}
                hint={k.aguardando > 0 ? `${k.aguardando} aguardando acao` : "Fluxo sob controle"}
              />
              <HeroMetric
                label="Faturamento"
                value={fmt(k.faturamentoHoje)}
                hint="Receita entregue no dia"
              />
              <HeroMetric
                label="Avaliacao"
                value={k.avaliacaoMedia ? k.avaliacaoMedia.toFixed(1) : "--"}
                hint={k.cancelados > 0 ? `${k.cancelados} cancelados hoje` : "Qualidade percebida"}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                to="/estabelecimento/pedidos"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-brand"
              >
                Abrir pedidos
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/estabelecimento/produtos"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-white/80 px-4 py-2.5 text-sm font-semibold text-foreground hover:border-primary/40 hover:text-primary dark:bg-card/80"
              >
                Ajustar cardapio
              </Link>
              <Link
                to="/estabelecimento/configuracoes"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-white/80 px-4 py-2.5 text-sm font-semibold text-foreground hover:border-primary/40 hover:text-primary dark:bg-card/80"
              >
                <Settings className="h-4 w-4" />
                Configuracoes
              </Link>
            </div>

            <div className="flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1.5 shadow-sm dark:bg-card/80">
                <DollarSign className="h-3.5 w-3.5 text-primary" />
                Taxa de entrega {fmt(estab.taxa_entrega_cents)}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1.5 shadow-sm dark:bg-card/80">
                <ShoppingBag className="h-3.5 w-3.5 text-primary" />
                Pedido minimo {fmt(estab.pedido_minimo_cents)}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1.5 shadow-sm dark:bg-card/80">
                <Clock className="h-3.5 w-3.5 text-primary" />
                Tempo medio {estab.tempo_medio_min ?? 30} min
              </span>
            </div>
          </div>

          <div className="relative hidden min-h-[320px] xl:block">
            <div className="absolute inset-y-6 left-12 right-0 rounded-[2rem] bg-primary/10 blur-3xl" />
            <img
              src={estab.capa_url || estab.logo_url || promoEstabelecimento}
              alt="Painel premium do estabelecimento"
              className="relative ml-auto h-full max-h-[360px] w-full max-w-[500px] rounded-[2rem] object-cover shadow-brand"
            />
            <div className="absolute left-0 top-8 w-56 rounded-[1.5rem] border border-white/70 bg-white/90 p-4 shadow-card backdrop-blur dark:border-border dark:bg-card/90">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                Saude da operacao
              </p>
              <p className="mt-2 text-2xl font-black text-foreground">
                {healthTone === "atencao"
                  ? "Atencao"
                  : healthTone === "movimento"
                    ? "Em movimento"
                    : "Estavel"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {healthTone === "atencao"
                  ? "Revise cancelamentos e itens de estoque baixo."
                  : healthTone === "movimento"
                    ? "Pedidos ativos e operacao rodando em bom ritmo."
                    : "Sem gargalos relevantes neste momento."}
              </p>
            </div>
            <div className="absolute -bottom-2 right-4 w-56 rounded-[1.5rem] border border-primary/15 bg-card/95 p-4 shadow-card">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                Loja premium
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Mais leitura de negocio, atalhos de acao e controle visual para decidir sem abrir
                mil telas.
              </p>
            </div>
          </div>
        </div>
      </section>

      {!estab.is_open ? (
        <div className="rounded-[1.5rem] border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            Sua loja esta fechada. Ative o botao do topo para voltar a receber pedidos.
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <KpiCard
            key={card.label}
            icon={card.icon}
            label={card.label}
            value={card.value}
            hint={card.hint}
          />
        ))}
      </div>

      <ScoreCard entityType="establishment" entityId={estab.id} />

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <section className="card-premium rounded-[1.75rem] border-none bg-gradient-to-br from-card to-muted/20 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Centro de acao
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground">
                  Atalhos para o que move a loja hoje.
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Reunimos as decisoes que mais mexem em pedido, conversao e ritmo de operacao.
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Store className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {QUICK_ACTIONS.map((action) => (
                <Link
                  key={action.to}
                  to={action.to}
                  className="rounded-[1.5rem] border border-border bg-background/70 p-4 transition-colors hover:border-primary/35 hover:bg-primary/5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-base font-bold text-foreground">{action.label}</p>
                    <ArrowRight className="h-4 w-4 text-primary" />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{action.description}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="card-premium rounded-[1.75rem] border-none bg-gradient-to-br from-card to-muted/20 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Status da loja
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <StatusMini
                title="Fila atual"
                value={`${k.aguardando + k.emPreparo}`}
                detail={
                  k.aguardando > 0 ? `${k.aguardando} esperando resposta` : "Sem fila travada"
                }
              />
              <StatusMini
                title="Entrega"
                value={fmt(estab.taxa_entrega_cents)}
                detail="Taxa configurada agora"
              />
              <StatusMini
                title="Minimo"
                value={fmt(estab.pedido_minimo_cents)}
                detail="Ticket de entrada"
              />
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="card-premium rounded-[1.75rem] border-none bg-gradient-to-br from-card to-muted/20 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Radar da operacao
            </p>
            <div className="mt-4 space-y-3">
              <InsightRow
                tone={k.aguardando > 0 ? "warning" : "success"}
                title={k.aguardando > 0 ? "Pedidos aguardando aceite" : "Fila de aceite limpa"}
                description={
                  k.aguardando > 0
                    ? `${k.aguardando} pedido(s) precisam de resposta para nao perder conversao.`
                    : "Sem pedidos parados esperando sua acao."
                }
              />
              <InsightRow
                tone={k.estoqueBaixo > 0 ? "warning" : "success"}
                title={k.estoqueBaixo > 0 ? "Itens com estoque baixo" : "Estoque sem alertas"}
                description={
                  k.estoqueBaixo > 0
                    ? `${k.estoqueBaixo} produto(s) merecem reposicao ou pausa.`
                    : "Nenhum item critico com estoque baixo agora."
                }
              />
              <InsightRow
                tone={k.cancelados > 0 ? "danger" : "success"}
                title={k.cancelados > 0 ? "Cancelamentos hoje" : "Cancelamentos controlados"}
                description={
                  k.cancelados > 0
                    ? `${k.cancelados} pedido(s) cancelados. Vale revisar disponibilidade e prazo.`
                    : "Sem cancelamentos relevantes no dia."
                }
              />
            </div>
          </section>

          <section className="card-premium rounded-[1.75rem] border-none bg-gradient-to-br from-card to-muted/20 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Dicas premium
            </p>
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <p>Fotos e descricoes bem cuidadas ajudam a converter melhor em vitrine e busca.</p>
              <p>
                Horarios atualizados reduzem cancelamento e passam mais confianca para o cliente.
              </p>
              <p>
                Responder rapido e manter preparo estavel melhora score, avaliacao e recorrencia.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
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

function KpiCard({
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

function StatusMini({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-[1.25rem] border border-border bg-background/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </p>
      <p className="mt-2 text-xl font-black text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function InsightRow({
  tone,
  title,
  description,
}: {
  tone: "success" | "warning" | "danger";
  title: string;
  description: string;
}) {
  const tones = {
    success: "border-emerald-500/20 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    danger: "border-destructive/20 bg-destructive/10 text-destructive",
  } as const;

  return (
    <div className={`rounded-[1.25rem] border p-4 ${tones[tone]}`}>
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-1 text-sm opacity-90">{description}</p>
    </div>
  );
}
