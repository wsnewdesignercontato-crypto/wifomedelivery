import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bike,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  MapPin,
  Package,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Store,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReviewForm } from "@/components/reviews";

export const Route = createFileRoute("/_authenticated/cliente/pedido/$id")({
  component: PedidoPage,
});

type Order = {
  id: string;
  status: string;
  subtotal_cents: number;
  frete_cents: number;
  desconto_cents: number;
  total_cents: number;
  observacoes: string | null;
  cancellation_reason: string | null;
  refund_status: string;
  refund_amount_cents: number;
  establishment_id: string;
  forma_pagamento: string;
  codigo_entrega: string | null;
  codigo_expira_em: string | null;
  tipo_entrega: "delivery" | "pickup" | null;
  created_at: string;
};
type Item = {
  id: string;
  nome_snapshot: string;
  preco_unit_cents: number;
  quantidade: number;
  observacoes: string | null;
};
type Delivery = {
  id: string;
  status: string;
  entregador_id: string | null;
  lat: number | null;
  lng: number | null;
};

const STAGES = [
  { key: "placed", label: "Pedido recebido" },
  { key: "accepted", label: "Aceito pela loja" },
  { key: "preparing", label: "Em preparo" },
  { key: "ready", label: "Pronto" },
  { key: "courier_assigned", label: "Entregador designado" },
  { key: "picked_up", label: "Coletado" },
  { key: "on_the_way", label: "A caminho" },
  { key: "delivered", label: "Entregue" },
] as const;

const CANCELABLE = new Set(["placed", "accepted"]);

const STATUS_META: Record<
  string,
  { label: string; copy: string; badgeClass: string; cardClass: string }
> = {
  placed: {
    label: "Recebido",
    copy: "Seu pedido já entrou na fila e está aguardando a confirmação da loja.",
    badgeClass: "bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300",
    cardClass: "border-amber-500/30 bg-amber-500/10",
  },
  accepted: {
    label: "Confirmado",
    copy: "A loja já assumiu o pedido e o preparo deve começar a qualquer momento.",
    badgeClass: "bg-primary/15 text-primary hover:bg-primary/20",
    cardClass: "border-primary/30 bg-primary/10",
  },
  preparing: {
    label: "Em preparo",
    copy: "Sua refeição está sendo preparada com acompanhamento em tempo real.",
    badgeClass: "bg-primary text-primary-foreground hover:bg-primary/90",
    cardClass: "border-primary/35 bg-primary/10",
  },
  ready: {
    label: "Pronto",
    copy: "Pedido finalizado pela loja e pronto para sair para entrega ou retirada.",
    badgeClass: "bg-sky-500/15 text-sky-700 hover:bg-sky-500/20 dark:text-sky-300",
    cardClass: "border-sky-500/30 bg-sky-500/10",
  },
  courier_assigned: {
    label: "Entregador a caminho",
    copy: "A entrega já foi assumida e estamos acompanhando a coleta.",
    badgeClass: "bg-primary text-primary-foreground hover:bg-primary/90",
    cardClass: "border-primary/35 bg-primary/10",
  },
  picked_up: {
    label: "Coletado",
    copy: "O pedido já está com o entregador e seguiu para a próxima etapa.",
    badgeClass: "bg-violet-500/15 text-violet-700 hover:bg-violet-500/20 dark:text-violet-300",
    cardClass: "border-violet-500/30 bg-violet-500/10",
  },
  on_the_way: {
    label: "A caminho",
    copy: "Seu pedido está em rota. Agora é só acompanhar os últimos minutos.",
    badgeClass: "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300",
    cardClass: "border-emerald-500/30 bg-emerald-500/10",
  },
  delivered: {
    label: "Entregue",
    copy: "Entrega concluída com sucesso. Se quiser, avalie sua experiência.",
    badgeClass: "bg-emerald-500 text-white hover:bg-emerald-500/90",
    cardClass: "border-emerald-500/35 bg-emerald-500/10",
  },
  cancelled: {
    label: "Cancelado",
    copy: "Esse pedido foi encerrado antes da conclusão.",
    badgeClass: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    cardClass: "border-destructive/35 bg-destructive/10",
  },
  refunded: {
    label: "Reembolsado",
    copy: "O pedido foi encerrado com reembolso registrado.",
    badgeClass: "bg-destructive/15 text-destructive hover:bg-destructive/20",
    cardClass: "border-destructive/30 bg-destructive/10",
  },
};

const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function PedidoPage() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loja, setLoja] = useState<{ id: string; nome: string } | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewed, setReviewed] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: o } = await supabase
        .from("orders")
        .select(
          "id,status,subtotal_cents,frete_cents,desconto_cents,total_cents,observacoes,cancellation_reason,refund_status,refund_amount_cents,establishment_id,forma_pagamento,codigo_entrega,codigo_expira_em,tipo_entrega,created_at",
        )
        .eq("id", id)
        .maybeSingle();
      setOrder(o as Order | null);
      if (!o) {
        setLoading(false);
        return;
      }
      const [it, e, d, r] = await Promise.all([
        supabase
          .from("order_items")
          .select("id,nome_snapshot,preco_unit_cents,quantidade,observacoes")
          .eq("order_id", id),
        supabase
          .from("establishments")
          .select("id,nome")
          .eq("id", (o as Order).establishment_id)
          .maybeSingle(),
        supabase
          .from("deliveries")
          .select("id,status,entregador_id,lat,lng")
          .eq("order_id", id)
          .maybeSingle(),
        supabase.from("reviews").select("id").eq("order_id", id).maybeSingle(),
      ]);
      setItems((it.data ?? []) as Item[]);
      setLoja(e.data as { id: string; nome: string } | null);
      setDelivery(d.data as Delivery | null);
      setReviewed(!!r.data);
      setLoading(false);
    }
    load();

    const ch = supabase
      .channel(`pedido-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` },
        (p) => {
          const next = p.new as Order;
          setOrder((prev) => {
            if (prev && prev.status !== "delivered" && next.status === "delivered") {
              toast.success("Pedido entregue!", {
                description: "Aproveite! Que tal avaliar sua experiência?",
              });
              if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                try {
                  navigator.vibrate?.([120, 60, 120]);
                } catch {
                  // ignore
                }
              }
            }
            return prev ? { ...prev, ...next } : next;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries", filter: `order_id=eq.${id}` },
        (p) => setDelivery(p.new as Delivery),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tracking_points",
          filter: `order_id=eq.${id}`,
        },
        (p) => {
          const t = p.new as { lat: number; lng: number };
          setDelivery((prev) => (prev ? { ...prev, lat: t.lat, lng: t.lng } : prev));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id]);

  async function cancelar() {
    const motivo = prompt("Motivo do cancelamento (opcional):") ?? "";
    if (!confirm("Cancelar este pedido?")) return;
    const { error } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        cancellation_reason: motivo || null,
        cancelled_by: user.id,
        cancelled_role: "cliente",
      })
      .eq("id", id);
    if (error)
      toast.error("A loja já iniciou o preparo e o cancelamento não está mais disponível.");
    else toast.success("Pedido cancelado");
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!order) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
        Pedido não encontrado.
      </div>
    );
  }

  const stageIdx = STAGES.findIndex((s) => s.key === order.status);
  const statusMeta = STATUS_META[order.status] ?? STATUS_META.accepted;
  const progress = stageIdx >= 0 ? Math.round(((stageIdx + 1) / STAGES.length) * 100) : 100;
  const hasLiveCode =
    !!order.codigo_entrega && !["delivered", "cancelled", "refunded"].includes(order.status);
  const codeExpired = order.codigo_expira_em
    ? new Date(order.codigo_expira_em) < new Date()
    : false;
  const totalItems = items.reduce((sum, item) => sum + item.quantidade, 0);
  const isPickup = order.tipo_entrega === "pickup";

  return (
    <div className="space-y-6">
      <section className="card-premium relative overflow-hidden border-none bg-gradient-to-br from-primary/12 via-white to-primary/5 p-5 dark:from-primary/15 dark:via-card dark:to-primary/10 sm:p-6">
        <div className="absolute -left-10 top-0 h-36 w-36 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -right-8 bottom-0 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-start">
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => navigate({ to: "/cliente/pedidos" })}
                aria-label="Voltar"
                className="mt-0.5 rounded-full border border-border bg-white/80 shadow-sm dark:bg-card/80"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={statusMeta.badgeClass}>{statusMeta.label}</Badge>
                  <Badge
                    variant="outline"
                    className={
                      isPickup
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : "border-primary/30 bg-primary/10 text-primary"
                    }
                  >
                    {isPickup ? (
                      <Store className="mr-1.5 h-3.5 w-3.5" />
                    ) : (
                      <Bike className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {isPickup ? "Retirada" : "Entrega"}
                  </Badge>
                  {order.refund_status === "completed" && order.refund_amount_cents > 0 && (
                    <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/20">
                      Reembolso {fmt(order.refund_amount_cents)}
                    </Badge>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground">
                    Pedido #{order.id.slice(0, 8).toUpperCase()}
                  </p>
                  <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
                    {loja?.nome ?? "Seu pedido"} em acompanhamento premium.
                  </h1>
                  <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                    {statusMeta.copy}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.4rem] border border-white/70 bg-white/85 p-4 shadow-card backdrop-blur dark:border-border dark:bg-card/90">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Total
                </p>
                <p className="mt-2 text-2xl font-black text-foreground">{fmt(order.total_cents)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {totalItems} {totalItems === 1 ? "item" : "itens"} no pedido
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-white/70 bg-white/85 p-4 shadow-card backdrop-blur dark:border-border dark:bg-card/90">
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  <CreditCard className="h-3.5 w-3.5" />
                  Pagamento
                </p>
                <p className="mt-2 text-lg font-black text-foreground">{order.forma_pagamento}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isPickup ? "Retirada na loja" : "Entrega monitorada"}
                </p>
              </div>
              <div className="rounded-[1.4rem] border border-white/70 bg-white/85 p-4 shadow-card backdrop-blur dark:border-border dark:bg-card/90">
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5" />
                  Criado em
                </p>
                <p className="mt-2 text-lg font-black text-foreground">
                  {new Date(order.created_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(order.created_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
            </div>

            {CANCELABLE.has(order.status) && (
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  className="rounded-full border-primary/25 bg-white/80 px-5 dark:bg-card/80"
                  onClick={cancelar}
                >
                  Cancelar pedido
                </Button>
                <Button
                  variant="ghost"
                  className="rounded-full px-5 text-muted-foreground"
                  onClick={() => navigate({ to: "/cliente/pedidos" })}
                >
                  Voltar aos pedidos
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-card backdrop-blur dark:border-border dark:bg-card/90">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-muted-foreground">
                  Andamento premium
                </p>
                <p className="mt-2 text-2xl font-black text-foreground">{progress}% concluído</p>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ShieldCheck className="h-6 w-6" />
              </div>
            </div>

            <div className="mt-4 h-2 rounded-full bg-muted/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary via-primary to-orange-400 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Etapa atual
                </p>
                <p className="mt-1 font-bold text-foreground">
                  {stageIdx >= 0 ? STAGES[stageIdx]?.label : statusMeta.label}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Loja
                </p>
                <p className="mt-1 font-semibold text-foreground">
                  {loja?.nome ?? "Aguardando dados"}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Modalidade
                </p>
                <p className="mt-1 font-semibold text-foreground">
                  {isPickup
                    ? "Retire na loja com código de segurança"
                    : "Entrega acompanhada com código de confirmação"}
                </p>
              </div>
              {delivery?.lat != null && delivery.lng != null && (
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`https://www.openstreetmap.org/?mlat=${delivery.lat}&mlon=${delivery.lng}#map=17/${delivery.lat}/${delivery.lng}`}
                  className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/70 p-3 transition hover:border-primary/30 hover:text-primary"
                >
                  <span className="inline-flex items-center gap-2 text-sm font-semibold">
                    <MapPin className="h-4 w-4" />
                    Abrir localização do entregador
                  </span>
                  <Sparkles className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {hasLiveCode && (
        <section
          className={`card-premium border-none p-5 text-center shadow-brand ${
            codeExpired
              ? "bg-gradient-to-br from-destructive/10 via-card to-destructive/5"
              : "bg-gradient-to-br from-primary/12 via-card to-primary/5"
          }`}
        >
          <div className="mx-auto max-w-3xl">
            <p
              className={`text-xs font-bold uppercase tracking-[0.28em] ${
                codeExpired ? "text-destructive" : "text-primary"
              }`}
            >
              {codeExpired
                ? "Código expirado"
                : isPickup
                  ? "Código premium de retirada"
                  : "Código premium de entrega"}
            </p>
            <p
              className={`mt-4 text-4xl font-black tracking-[0.45em] sm:text-5xl ${
                codeExpired ? "text-destructive/70 line-through" : "text-primary"
              }`}
            >
              {order.codigo_entrega}
            </p>
            <p className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground">
              {codeExpired
                ? "Seu código venceu por segurança. Gere um novo para continuar a retirada ou a confirmação da entrega."
                : isPickup
                  ? "Mostre este código na loja no momento da retirada para liberar o pedido com segurança."
                  : "Informe este código ao entregador na chegada para concluir a entrega com segurança."}
            </p>
            {codeExpired && (
              <Button
                size="lg"
                className="mt-5 rounded-full px-6"
                onClick={async () => {
                  const { data, error } = await supabase.rpc("regenerate_delivery_code", {
                    p_order_id: order.id,
                  });
                  if (error) {
                    toast.error("Não foi possível gerar novo código");
                    return;
                  }
                  setOrder((o) =>
                    o
                      ? {
                          ...o,
                          codigo_entrega: data as string,
                          codigo_expira_em: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
                        }
                      : o,
                  );
                  toast.success("Novo código gerado");
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Gerar novo código
              </Button>
            )}
          </div>
        </section>
      )}

      <section className="card-premium space-y-4 border-none bg-gradient-to-br from-card to-muted/20 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Linha do pedido
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground">
              Cada etapa mais clara, sem ruído.
            </h2>
          </div>
          <Badge className={statusMeta.badgeClass}>{statusMeta.label}</Badge>
        </div>

        {order.status === "cancelled" ? (
          <div className="rounded-[1.4rem] border border-destructive/40 bg-destructive/10 p-4">
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              <span className="font-semibold">Pedido cancelado</span>
            </div>
            {order.cancellation_reason && (
              <p className="mt-2 text-sm text-muted-foreground">{order.cancellation_reason}</p>
            )}
          </div>
        ) : order.status === "delivered" ? (
          <div className="rounded-[1.4rem] border border-emerald-500/40 bg-emerald-500/10 p-4">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold">Pedido entregue com sucesso</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Tudo certo por aqui. Agora você já pode avaliar a loja e o entregador.
            </p>
          </div>
        ) : order.status === "refunded" ? (
          <div className="rounded-[1.4rem] border border-destructive/35 bg-destructive/10 p-4">
            <div className="flex items-center gap-2 text-destructive">
              <ReceiptText className="h-5 w-5" />
              <span className="font-semibold">Pedido reembolsado</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Valor devolvido: {fmt(order.refund_amount_cents ?? 0)}.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-3 rounded-[1.5rem] border border-border/70 bg-background/70 p-4">
              {STAGES.map((s, i) => {
                const done = i < stageIdx;
                const current = i === stageIdx;
                return (
                  <div key={s.key} className="flex items-center gap-3">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                        done
                          ? "bg-primary text-primary-foreground"
                          : current
                            ? "bg-primary/15 text-primary ring-2 ring-primary/30"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`font-semibold ${
                          current
                            ? "text-foreground"
                            : done
                              ? "text-foreground/90"
                              : "text-muted-foreground"
                        }`}
                      >
                        {s.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {current ? "Etapa atual" : done ? "Concluída" : "Aguardando"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={`rounded-[1.5rem] border p-4 ${statusMeta.cardClass}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Destaque da etapa
              </p>
              <p className="mt-2 text-xl font-black text-foreground">
                {stageIdx >= 0 ? STAGES[stageIdx]?.label : statusMeta.label}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{statusMeta.copy}</p>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        {delivery && delivery.lat != null && delivery.lng != null && (
          <section className="card-premium space-y-4 border-none bg-gradient-to-br from-card to-muted/20 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Rastreamento
                </p>
                <h2 className="mt-2 text-xl font-black text-foreground">Entregador em movimento</h2>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MapPin className="h-5 w-5" />
              </div>
            </div>

            <div className="rounded-[1.4rem] border border-border/70 bg-background/70 p-4">
              <p className="text-sm font-semibold text-foreground">Última posição registrada</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {delivery.lat.toFixed(5)}, {delivery.lng.toFixed(5)}
              </p>
              <a
                target="_blank"
                rel="noreferrer"
                href={`https://www.openstreetmap.org/?mlat=${delivery.lat}&mlon=${delivery.lng}#map=17/${delivery.lat}/${delivery.lng}`}
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:border-primary/35 hover:bg-primary/15"
              >
                Abrir no mapa
                <Sparkles className="h-4 w-4" />
              </a>
            </div>
          </section>
        )}

        <section className="card-premium space-y-4 border-none bg-gradient-to-br from-card to-muted/20 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Resumo do pedido
              </p>
              <h2 className="mt-2 text-xl font-black text-foreground">
                Itens e fechamento financeiro
              </h2>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Package className="h-5 w-5" />
            </div>
          </div>

          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-[1.3rem] border border-border/70 bg-background/70 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">
                      {item.quantidade}x {item.nome_snapshot}
                    </p>
                    {item.observacoes && (
                      <p className="mt-1 text-xs text-muted-foreground">Obs: {item.observacoes}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-bold text-foreground">
                    {fmt(item.preco_unit_cents * item.quantidade)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 rounded-[1.3rem] border border-border/70 bg-background/70 p-4 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{fmt(order.subtotal_cents)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>{isPickup ? "Retirada" : "Entrega"}</span>
              <span>{isPickup || order.frete_cents === 0 ? "Grátis" : fmt(order.frete_cents)}</span>
            </div>
            {order.desconto_cents > 0 && (
              <div className="flex justify-between text-primary">
                <span>Desconto</span>
                <span>-{fmt(order.desconto_cents)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-2 text-base font-black text-foreground">
              <span>Total</span>
              <span>{fmt(order.total_cents)}</span>
            </div>
            <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
              <CreditCard className="h-3.5 w-3.5" />
              Pagamento: {order.forma_pagamento}
            </div>
          </div>

          {order.observacoes && (
            <div className="rounded-[1.3rem] border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
              <strong>Observações:</strong> {order.observacoes}
            </div>
          )}
        </section>
      </div>

      {order.status === "delivered" && !reviewed && (
        <section className="card-premium border-none bg-gradient-to-br from-card to-muted/20 p-5">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Sua opinião
            </p>
            <h2 className="mt-2 text-xl font-black text-foreground">
              Feche a experiência com uma avaliação
            </h2>
          </div>
          <ReviewForm
            orderId={order.id}
            clienteId={user.id}
            establishmentId={order.establishment_id}
            entregadorId={delivery?.entregador_id ?? null}
            onSubmitted={() => setReviewed(true)}
          />
        </section>
      )}

      {order.status === "delivered" && reviewed && (
        <div className="rounded-[1.4rem] border border-emerald-500/35 bg-emerald-500/10 p-4 text-center text-sm font-semibold text-emerald-700 dark:text-emerald-300">
          Avaliação enviada. Obrigado por confiar na plataforma.
        </div>
      )}
    </div>
  );
}
