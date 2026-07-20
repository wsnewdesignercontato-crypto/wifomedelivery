import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  LogOut,
  ShoppingBag,
  ShoppingCart,
  Plus,
  Minus,
  MapPin,
  Clock,
  Star,
  Loader2,
  ReceiptText,
  ArrowLeft,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { ReviewForm } from "@/components/reviews";
import { OrderHistory } from "@/components/order-history";
import { IFomeLogo } from "@/components/ifome-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/cliente")({
  component: ClienteApp,
});

type Categoria = { id: string; nome: string; slug: string; icone: string | null };
type Estab = {
  id: string;
  nome: string;
  descricao: string | null;
  categoria_id: string | null;
  logo_url: string | null;
  capa_url: string | null;
  taxa_entrega_cents: number;
  tempo_medio_min: number | null;
  pedido_minimo_cents: number;
  avaliacao: number | null;
  is_open: boolean;
  cidade: string | null;
};
type Produto = {
  id: string;
  nome: string;
  descricao: string | null;
  foto_url: string | null;
  preco_cents: number;
  preco_promo_cents: number | null;
  disponivel: boolean;
};
type CartItem = { product_id: string; nome: string; preco_cents: number; qty: number };
type Order = {
  id: string;
  establishment_id: string;
  status: string;
  total_cents: number;
  created_at: string;
  observacoes: string | null;
  cancellation_reason?: string | null;
  refund_status?: string | null;
  refund_amount_cents?: number | null;
};

const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_LABEL: Record<string, string> = {
  placed: "Pedido recebido",
  accepted: "Aceito pela loja",
  preparing: "Em preparo",
  ready: "Pronto",
  waiting_courier: "Aguardando entregador",
  courier_assigned: "Entregador a caminho",
  picked_up: "Pedido coletado",
  on_the_way: "A caminho",
  arriving: "Chegando",
  delivered: "Entregue",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

const CANCELABLE_BY_CLIENTE = new Set(["placed", "accepted"]);


function ClienteApp() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const navigate = useNavigate();
  const [tab, setTab] = useState<"descobrir" | "pedidos">("descobrir");
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [estabs, setEstabs] = useState<Estab[]>([]);
  const [catSel, setCatSel] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [lojaAberta, setLojaAberta] = useState<Estab | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carrinho, setCarrinho] = useState<CartItem[]>([]);
  const [carrinhoLoja, setCarrinhoLoja] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [endereco, setEndereco] = useState("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [meusPedidos, setMeusPedidos] = useState<Order[]>([]);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const [cats, es] = await Promise.all([
        supabase.from("global_categories").select("id,nome,slug,icone").eq("ativo", true).order("ordem"),
        supabase
          .from("establishments")
          .select("id,nome,descricao,categoria_id,logo_url,capa_url,taxa_entrega_cents,tempo_medio_min,pedido_minimo_cents,avaliacao,is_open,cidade")
          .eq("status", "aprovado")
          .order("avaliacao", { ascending: false, nullsFirst: false }),
      ]);
      setCategorias((cats.data ?? []) as Categoria[]);
      setEstabs((es.data ?? []) as Estab[]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (tab !== "pedidos") return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("id,establishment_id,status,total_cents,created_at,observacoes,cancellation_reason,refund_status,refund_amount_cents")
        .eq("cliente_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (active) setMeusPedidos((data ?? []) as Order[]);
      const delivered = (data ?? []).filter((o: Order) => o.status === "delivered").map((o: Order) => o.id);
      if (delivered.length > 0) {
        const { data: revs } = await supabase.from("reviews").select("order_id").in("order_id", delivered);
        if (active) setReviewedIds(new Set((revs ?? []).map((r: { order_id: string }) => r.order_id)));
      }
    })();
    const ch = supabase
      .channel("cliente-pedidos")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `cliente_id=eq.${user.id}` },
        (payload) => {
          setMeusPedidos((prev) => {
            const rec = payload.new as Order;
            const others = prev.filter((p) => p.id !== rec.id);
            return [rec, ...others].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
          });
        },
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [tab, user.id]);

  const estabsFiltrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return estabs.filter(
      (e) =>
        (!catSel || e.categoria_id === catSel) &&
        (!b || e.nome.toLowerCase().includes(b)),
    );
  }, [estabs, catSel, busca]);

  const total = carrinho.reduce((s, i) => s + i.preco_cents * i.qty, 0);

  async function abrirLoja(e: Estab) {
    setLojaAberta(e);
    const { data } = await supabase
      .from("products")
      .select("id,nome,descricao,foto_url,preco_cents,preco_promo_cents,disponivel")
      .eq("establishment_id", e.id)
      .eq("disponivel", true)
      .order("destaque", { ascending: false })
      .order("ordem");
    setProdutos((data ?? []) as Produto[]);
  }

  function addAoCarrinho(p: Produto) {
    if (carrinhoLoja && carrinhoLoja !== lojaAberta!.id) {
      if (!confirm("Você já tem itens de outra loja. Substituir carrinho?")) return;
      setCarrinho([]);
    }
    setCarrinhoLoja(lojaAberta!.id);
    setCarrinho((prev) => {
      const preco = p.preco_promo_cents ?? p.preco_cents;
      const existe = prev.find((i) => i.product_id === p.id);
      if (existe) {
        return prev.map((i) => (i.product_id === p.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { product_id: p.id, nome: p.nome, preco_cents: preco, qty: 1 }];
    });
    toast.success(`${p.nome} adicionado`);
  }

  function alterarQty(id: string, delta: number) {
    setCarrinho((prev) =>
      prev
        .map((i) => (i.product_id === id ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0),
    );
  }

  async function confirmarPedido() {
    if (!carrinhoLoja || carrinho.length === 0) return;
    const loja = estabs.find((e) => e.id === carrinhoLoja);
    if (!loja) return;
    if (total < loja.pedido_minimo_cents) {
      toast.error(`Pedido mínimo desta loja é ${fmt(loja.pedido_minimo_cents)}`);
      return;
    }
    if (!endereco.trim()) {
      toast.error("Informe o endereço de entrega");
      return;
    }
    setEnviando(true);
    const totalFinal = total + loja.taxa_entrega_cents;
    const { data: pedido, error } = await supabase
      .from("orders")
      .insert({
        cliente_id: user.id,
        establishment_id: loja.id,
        status: "placed",
        subtotal_cents: total,
        frete_cents: loja.taxa_entrega_cents,
        desconto_cents: 0,
        total_cents: totalFinal,
        forma_pagamento: "dinheiro",
        endereco_entrega: { endereco },
        observacoes: obs || null,
      })
      .select("id")
      .single();
    if (error || !pedido) {
      setEnviando(false);
      toast.error("Falha ao criar pedido");
      return;
    }
    const itens = carrinho.map((i) => ({
      order_id: pedido.id,
      product_id: i.product_id,
      nome_snapshot: i.nome,
      preco_unit_cents: i.preco_cents,
      quantidade: i.qty,
    }));
    const { error: err2 } = await supabase.from("order_items").insert(itens);
    setEnviando(false);
    if (err2) {
      toast.error("Falha ao registrar itens");
      return;
    }
    toast.success("Pedido enviado!");
    setCarrinho([]);
    setCarrinhoLoja(null);
    setCheckoutOpen(false);
    setLojaAberta(null);
    setEndereco("");
    setObs("");
    setTab("pedidos");
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <IFomeLogo size="sm" />
          <div className="flex items-center gap-2">
            {carrinho.length > 0 && tab === "descobrir" && (
              <Button size="sm" onClick={() => setCheckoutOpen(true)}>
                <ShoppingCart className="mr-2 h-4 w-4" />
                {carrinho.reduce((s, i) => s + i.qty, 0)} · {fmt(total)}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/", replace: true });
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="mx-auto max-w-4xl px-4 pb-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "descobrir" | "pedidos")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="descobrir">Descobrir</TabsTrigger>
              <TabsTrigger value="pedidos">Meus pedidos</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-4">
        {tab === "descobrir" ? (
          <>
            <Input
              placeholder="Buscar restaurantes..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="mb-4"
            />
            <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
              <button
                onClick={() => setCatSel(null)}
                className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition ${
                  !catSel ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
                }`}
              >
                Todas
              </button>
              {categorias.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCatSel(c.id === catSel ? null : c.id)}
                  className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition ${
                    catSel === c.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card"
                  }`}
                >
                  {c.nome}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : estabsFiltrados.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
                <ShoppingBag className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Nenhum estabelecimento aprovado ainda por aqui.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {estabsFiltrados.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => abrirLoja(e)}
                    className="group overflow-hidden rounded-2xl border border-border bg-card text-left shadow-card transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-brand"
                  >
                    <div className="relative h-32 w-full bg-gradient-to-br from-primary/20 to-primary/5">
                      {e.capa_url && (
                        <img src={e.capa_url} alt={e.nome} className="h-full w-full object-cover" />
                      )}
                      {!e.is_open && (
                        <Badge variant="secondary" className="absolute right-2 top-2">
                          Fechado
                        </Badge>
                      )}
                    </div>
                    <div className="p-3">
                      <h3 className="font-semibold text-foreground">{e.nome}</h3>
                      {e.descricao && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{e.descricao}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {e.avaliacao != null && (
                          <span className="flex items-center gap-1">
                            <Star className="h-3 w-3 fill-primary text-primary" />
                            {Number(e.avaliacao).toFixed(1)}
                          </span>
                        )}
                        {e.tempo_medio_min && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {e.tempo_medio_min} min
                          </span>
                        )}
                        <span>Entrega {fmt(e.taxa_entrega_cents)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            {meusPedidos.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
                <ReceiptText className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">Você ainda não fez pedidos.</p>
              </div>
            ) : (
              meusPedidos.map((o) => {
                const loja = estabs.find((e) => e.id === o.establishment_id);
                const canCancel = CANCELABLE_BY_CLIENTE.has(o.status);
                return (
                  <div key={o.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-foreground">{loja?.nome ?? "Restaurante"}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(o.created_at).toLocaleString("pt-BR")}
                        </p>
                      </div>
                      <span className="font-bold text-primary">{fmt(o.total_cents)}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge className="bg-primary/15 text-primary hover:bg-primary/20">
                        {STATUS_LABEL[o.status] ?? o.status}
                      </Badge>
                      {o.refund_status === "completed" && (
                        <Badge variant="secondary">Reembolso {fmt(o.refund_amount_cents ?? 0)}</Badge>
                      )}
                      {canCancel && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-auto"
                          onClick={async () => {
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
                              .eq("id", o.id);
                            if (error) toast.error("Não foi possível cancelar. Loja já iniciou o preparo?");
                            else toast.success("Pedido cancelado");
                          }}
                        >
                          Cancelar pedido
                        </Button>
                      )}
                    </div>
                    {o.status === "cancelled" && o.cancellation_reason && (
                      <p className="mt-2 rounded-lg bg-muted p-2 text-xs">Motivo: {o.cancellation_reason}</p>
                    )}
                    {o.status === "delivered" && loja && (
                      reviewedIds.has(o.id) ? (
                        <p className="mt-3 text-xs text-muted-foreground">✓ Você já avaliou este pedido</p>
                      ) : (
                        <ReviewForm
                          orderId={o.id}
                          clienteId={user.id}
                          establishmentId={loja.id}
                          onSubmitted={() => setReviewedIds((prev) => new Set(prev).add(o.id))}
                        />
                      )
                    )}
                  </div>
                );
              })

            )}
          </div>
        )}
      </main>

      {/* Sheet da loja */}
      <Sheet open={!!lojaAberta} onOpenChange={(o) => !o && setLojaAberta(null)}>
        <SheetContent side="right" className="w-full max-w-lg overflow-y-auto sm:max-w-lg">
          {lojaAberta && (
            <>
              <SheetHeader>
                <SheetTitle>{lojaAberta.nome}</SheetTitle>
              </SheetHeader>
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                {lojaAberta.cidade && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {lojaAberta.cidade}
                  </span>
                )}
                <span>Entrega {fmt(lojaAberta.taxa_entrega_cents)}</span>
                <span>Mínimo {fmt(lojaAberta.pedido_minimo_cents)}</span>
              </div>

              <div className="mt-5 space-y-3">
                {produtos.length === 0 && (
                  <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Esta loja ainda não cadastrou produtos.
                  </p>
                )}
                {produtos.map((p) => {
                  const preco = p.preco_promo_cents ?? p.preco_cents;
                  return (
                    <div key={p.id} className="flex gap-3 rounded-2xl border border-border bg-card p-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                        {p.foto_url && <img src={p.foto_url} alt={p.nome} className="h-full w-full object-cover" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-foreground">{p.nome}</p>
                        {p.descricao && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">{p.descricao}</p>
                        )}
                        <div className="mt-1 flex items-center justify-between">
                          <span className="font-bold text-primary">{fmt(preco)}</span>
                          <Button size="sm" onClick={() => addAoCarrinho(p)}>
                            <Plus className="mr-1 h-3 w-3" /> Adicionar
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {carrinho.length > 0 && carrinhoLoja === lojaAberta.id && (
                <div className="sticky bottom-0 -mx-6 mt-6 border-t border-border bg-background p-4">
                  <Button className="w-full" onClick={() => setCheckoutOpen(true)}>
                    Ver carrinho · {fmt(total)}
                  </Button>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Sheet checkout */}
      <Sheet open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Seu carrinho</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {carrinho.map((i) => (
              <div key={i.product_id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{i.nome}</p>
                  <p className="text-xs text-muted-foreground">{fmt(i.preco_cents)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => alterarQty(i.product_id, -1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center text-sm font-semibold">{i.qty}</span>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => alterarQty(i.product_id, +1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
            {carrinho.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">Carrinho vazio</p>
            )}

            <div className="space-y-2 pt-3">
              <Label htmlFor="end">Endereço de entrega</Label>
              <Input
                id="end"
                placeholder="Rua, número, bairro"
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
              />
              <Label htmlFor="obs">Observações</Label>
              <Textarea
                id="obs"
                placeholder="Opcional"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
              />
            </div>

            <div className="space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{fmt(total)}</span>
              </div>
              {carrinhoLoja && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Entrega</span>
                  <span>{fmt(estabs.find((e) => e.id === carrinhoLoja)?.taxa_entrega_cents ?? 0)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                <span>Total</span>
                <span className="text-primary">
                  {fmt(total + (estabs.find((e) => e.id === carrinhoLoja)?.taxa_entrega_cents ?? 0))}
                </span>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">Pagamento: dinheiro na entrega</p>
            </div>

            <Button
              className="w-full"
              size="lg"
              disabled={enviando || carrinho.length === 0}
              onClick={confirmarPedido}
            >
              {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar pedido
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setCheckoutOpen(false)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Continuar comprando
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
