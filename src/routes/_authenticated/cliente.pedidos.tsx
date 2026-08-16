import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Bike,
  Clock3,
  Loader2,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/cliente/pedidos")({
  component: PedidosPage,
});

type Order = {
  id: string;
  status: string;
  total_cents: number;
  created_at: string;
  establishment_id: string;
  tipo_entrega: "delivery" | "pickup" | null;
};

const STATUS_LABEL: Record<string, string> = {
  placed: "Recebido",
  accepted: "Aceito",
  preparing: "Em preparo",
  ready: "Pronto",
  waiting_courier: "Aguardando entregador",
  courier_assigned: "Entregador designado",
  picked_up: "Coletado",
  on_the_way: "A caminho",
  arriving: "Chegando",
  delivered: "Entregue",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

const STATUS_TONE: Record<string, string> = {
  delivered: "bg-emerald-500 text-white hover:bg-emerald-500/90",
  cancelled: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  refunded: "bg-destructive/15 text-destructive hover:bg-destructive/20",
};

const ACTIVE_STATUSES = new Set([
  "placed",
  "accepted",
  "preparing",
  "ready",
  "waiting_courier",
  "courier_assigned",
  "picked_up",
  "on_the_way",
  "arriving",
]);

const FILTER_LABEL: Record<"todos" | "ativos" | "concluidos", string> = {
  todos: "Todos",
  ativos: "Em andamento",
  concluidos: "Concluidos",
};

const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function PedidosPage() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const [orders, setOrders] = useState<Order[]>([]);
  const [lojas, setLojas] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"todos" | "ativos" | "concluidos">("todos");

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("orders")
        .select("id,status,total_cents,created_at,establishment_id,tipo_entrega")
        .eq("cliente_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      const arr = (data ?? []) as Order[];
      setOrders(arr);
      const ids = Array.from(new Set(arr.map((o) => o.establishment_id)));
      if (ids.length) {
        const { data: es } = await supabase.from("establishments").select("id,nome").in("id", ids);
        const map: Record<string, string> = {};
        (es ?? []).forEach((e) => {
          map[e.id] = e.nome;
        });
        setLojas(map);
      }
      setLoading(false);
    }
    load();
    const ch = supabase
      .channel(`pedidos-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `cliente_id=eq.${user.id}` },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user.id]);

  const filteredOrders = useMemo(
    () =>
      orders.filter((o) => {
        if (filter === "ativos") return ACTIVE_STATUSES.has(o.status);
        if (filter === "concluidos") return !ACTIVE_STATUSES.has(o.status);
        return true;
      }),
    [orders, filter],
  );

  const summary = useMemo(() => {
    const activeCount = orders.filter((o) => ACTIVE_STATUSES.has(o.status)).length;
    const completedCount = orders.length - activeCount;
    const totalSpent = orders.reduce((sum, o) => sum + (o.total_cents ?? 0), 0);
    return { activeCount, completedCount, totalSpent };
  }, [orders]);

  const filterCounts = useMemo(
    () => ({
      todos: orders.length,
      ativos: orders.filter((o) => ACTIVE_STATUSES.has(o.status)).length,
      concluidos: orders.filter((o) => !ACTIVE_STATUSES.has(o.status)).length,
    }),
    [orders],
  );

  async function repetir(o: Order) {
    const { data: items } = await supabase
      .from("order_items")
      .select("product_id,nome_snapshot,preco_unit_cents,quantidade,observacoes")
      .eq("order_id", o.id);
    if (!items || items.length === 0) {
      toast.error("Sem itens para repetir");
      return;
    }

    const pids = items.map((i) => i.product_id).filter(Boolean) as string[];
    const { data: prods } = await supabase
      .from("products")
      .select("id,preco_cents,preco_promo_cents,disponivel")
      .in("id", pids);
    const map = new Map((prods ?? []).map((p) => [p.id, p]));
    const validos = items.filter((i) => i.product_id && map.get(i.product_id)?.disponivel);
    if (validos.length === 0) {
      toast.error("Nenhum item disponivel");
      return;
    }

    await supabase.from("cart_items").delete().eq("user_id", user.id);
    await supabase.from("cart_items").insert(
      validos.map((i) => {
        const cur = map.get(i.product_id!)!;
        return {
          user_id: user.id,
          establishment_id: o.establishment_id,
          product_id: i.product_id!,
          nome_snapshot: i.nome_snapshot,
          preco_unit_cents: cur.preco_promo_cents ?? cur.preco_cents,
          quantidade: i.quantidade,
          observacoes: i.observacoes,
        };
      }),
    );
    toast.success("Itens adicionados ao carrinho");
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="card-premium relative overflow-hidden border-none bg-gradient-to-br from-primary/12 via-white to-primary/5 p-5 dark:from-primary/15 dark:via-card dark:to-primary/10 sm:p-6">
        <div className="absolute -left-10 top-0 h-36 w-36 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -right-10 bottom-0 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative grid gap-6 xl:grid-cols-[1.14fr_0.86fr] xl:items-start">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary text-primary-foreground">
                Historico premium do cliente
              </Badge>
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                Pedidos em tempo real
              </Badge>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-muted-foreground">
                Seu painel de pedidos ficou mais claro do primeiro clique ate a repeticao.
              </p>
              <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
                Acompanhe, filtre e repita seus pedidos com mais confianca.
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                Veja o andamento, relembre suas compras e volte ao carrinho em poucos toques com uma
                leitura mais premium.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <HeroMetric
                label="Total de pedidos"
                value={String(orders.length)}
                hint="Seu historico recente"
              />
              <HeroMetric
                label="Em andamento"
                value={String(summary.activeCount)}
                hint="Pedidos ativos agora"
              />
              <HeroMetric
                label="Concluidos"
                value={String(summary.completedCount)}
                hint="Entregues, cancelados ou reembolsados"
              />
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-card backdrop-blur dark:border-border dark:bg-card/90">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-muted-foreground">
                  Leitura rapida
                </p>
                <p className="mt-2 text-2xl font-black text-foreground">{FILTER_LABEL[filter]}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ShoppingBag className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Volume
                </p>
                <p className="mt-1 font-bold text-foreground">
                  {filterCounts[filter]} pedidos visiveis
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Total movido
                </p>
                <p className="mt-1 font-bold text-foreground">{fmt(summary.totalSpent)}</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-border/70 bg-background/70 p-3">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                Confianca no pedido
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                Codigo, status, horario e repeticao organizados para voce decidir mais rapido.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="card-premium border-none bg-gradient-to-br from-card to-muted/20 p-3">
        <div className="flex flex-wrap gap-2">
          {(["todos", "ativos", "concluidos"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-4 py-2 text-xs font-bold transition ${
                filter === f
                  ? "border-primary bg-primary text-primary-foreground shadow-brand"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {FILTER_LABEL[f]} ({filterCounts[f]})
            </button>
          ))}
        </div>
      </section>

      {filteredOrders.length === 0 ? (
        <div className="card-premium rounded-[1.75rem] border-dashed p-10 text-center">
          <ReceiptText className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-lg font-black text-foreground">Nenhum pedido nesta lista.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Troque o filtro ou faca um novo pedido para voltar a ver movimentacao aqui.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredOrders.map((o) => {
            const isFinished = !ACTIVE_STATUSES.has(o.status);
            const statusClass =
              STATUS_TONE[o.status] ?? "bg-primary/10 text-primary hover:bg-primary/15";

            return (
              <Link
                key={o.id}
                to="/cliente/pedido/$id"
                params={{ id: o.id }}
                className="card-premium group rounded-[1.75rem] border-none bg-gradient-to-br from-card to-muted/20 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={statusClass}>{STATUS_LABEL[o.status] ?? o.status}</Badge>
                      <Badge
                        variant="outline"
                        className={
                          o.tipo_entrega === "pickup"
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            : "border-primary/30 bg-primary/10 text-primary"
                        }
                      >
                        {o.tipo_entrega === "pickup" ? (
                          <>
                            <Store className="mr-1.5 h-3.5 w-3.5" />
                            Retirada
                          </>
                        ) : (
                          <>
                            <Bike className="mr-1.5 h-3.5 w-3.5" />
                            Entrega
                          </>
                        )}
                      </Badge>
                    </div>

                    <h2 className="mt-4 truncate text-xl font-black tracking-tight text-foreground">
                      {lojas[o.establishment_id] ?? "Restaurante"}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString("pt-BR")} as{" "}
                      {new Date(o.created_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {isFinished
                        ? "Pedido finalizado e pronto para consulta ou repeticao."
                        : "Toque para acompanhar o status, codigo de seguranca e detalhes da entrega."}
                    </p>
                  </div>

                  <div className="text-right">
                    <p
                      className={`text-2xl font-black ${isFinished ? "text-foreground" : "text-primary"}`}
                    >
                      {fmt(o.total_cents)}
                    </p>
                    <p className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      Ver detalhes
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
                  <span className="inline-flex items-center gap-2 rounded-full bg-background/80 px-3 py-1.5">
                    <Clock3 className="h-3.5 w-3.5 text-primary" />
                    Atualizacao em tempo real
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-background/80 px-3 py-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Experiencia premium
                  </span>
                </div>

                {(o.status === "delivered" ||
                  o.status === "cancelled" ||
                  o.status === "refunded") && (
                  <div className="mt-4 flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      onClick={(e) => {
                        e.preventDefault();
                        repetir(o);
                      }}
                    >
                      Repetir pedido
                    </Button>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
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
