import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus, Minus, Loader2, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadCustomerCouponOffers, type CustomerCouponOffer } from "@/lib/customer-catalog-data";
import { DATA_UPDATED_EVENT } from "@/lib/app-refresh";

export const Route = createFileRoute("/_authenticated/cliente/carrinho")({
  head: () => ({
    meta: [
      { title: "Cliente — Carrinho | PedeTrem" },
      { name: "description", content: "PedeTrem: cliente, carrinho." },
      { property: "og:title", content: "Cliente — Carrinho | PedeTrem" },
      { property: "og:description", content: "PedeTrem: cliente, carrinho." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CarrinhoPage,
});

type CartAddon = { id: string; nome: string; preco_extra_cents: number; group_nome: string };
type Item = {
  id: string;
  product_id: string;
  nome_snapshot: string;
  preco_unit_cents: number;
  quantidade: number;
  observacoes: string | null;
  establishment_id: string;
  addons: CartAddon[];
};
type Estab = { id: string; nome: string; taxa_entrega_cents: number; pedido_minimo_cents: number };
type CouponRow = CustomerCouponOffer & { code: string };

const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function CarrinhoPage() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const navigate = useNavigate();
  const [storedItems, setItems] = useState<Item[]>([]);
  const [storedEstab, setEstab] = useState<Estab | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const items = loadedUserId === user.id ? storedItems : [];
  const estabId = items[0]?.establishment_id ?? null;
  const estab = loadedUserId === user.id && storedEstab?.id === estabId ? storedEstab : null;
  const couponScope = `${user.id}:${estabId ?? ""}`;
  const [couponChoice, setCouponChoice] = useState({ scope: "", value: "" });
  const cupom = couponChoice.scope === couponScope ? couponChoice.value : "";
  const setCupom = (value: string) => setCouponChoice({ scope: couponScope, value });
  const [couponState, setCouponState] = useState<{ scope: string; rows: CouponRow[] }>({
    scope: "",
    rows: [],
  });
  const coupons = couponState.scope === couponScope ? couponState.rows : [];
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let sequence = 0;
    let scheduled = false;
    setLoading(true);
    async function load() {
      const request = ++sequence;
      const current = () => alive && request === sequence;
      setCouponState({ scope: "", rows: [] });
      try {
        const { data, error } = await supabase
          .from("cart_items")
          .select(
            "id,product_id,nome_snapshot,preco_unit_cents,quantidade,observacoes,establishment_id,addons",
          )
          .eq("user_id", user.id)
          .order("created_at");
        if (!current()) return;
        if (error) throw error;
        const arr = ((data ?? []) as unknown as Item[]).map((item) => ({
          ...item,
          addons: Array.isArray(item.addons) ? item.addons : [],
        }));
        const storeId = arr[0]?.establishment_id;
        setItems(arr);
        setLoadedUserId(user.id);
        setEstab((previous) => (previous?.id === storeId ? previous : null));
        if (!storeId) return;
        const [store, offers] = await Promise.allSettled([
          supabase
            .from("establishments")
            .select("id,nome,taxa_entrega_cents,pedido_minimo_cents")
            .eq("id", storeId)
            .maybeSingle(),
          loadCustomerCouponOffers([storeId]),
        ]);
        if (!current()) return;
        setEstab(store.status === "fulfilled" && !store.value.error ? store.value.data : null);
        setCouponState({
          scope: `${user.id}:${storeId}`,
          rows:
            offers.status === "fulfilled"
              ? offers.value.filter(
                  (offer): offer is CouponRow =>
                    offer.establishment_id === storeId &&
                    typeof offer.code === "string" &&
                    offer.code.trim().length > 0,
                )
              : [],
        });
      } catch {
        if (current()) {
          setItems([]);
          setEstab(null);
          setLoadedUserId(user.id);
          setCouponState({ scope: "", rows: [] });
        }
      } finally {
        if (current()) setLoading(false);
      }
    }
    const refresh = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        if (alive) void load();
      });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    window.addEventListener(DATA_UPDATED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", onVisible);
    const ch = supabase
      .channel(`coupons-cliente-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "coupons" }, refresh)
      .subscribe();
    return () => {
      alive = false;
      window.removeEventListener(DATA_UPDATED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(ch);
    };
  }, [user.id]);

  async function alterar(id: string, qty: number) {
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      await supabase.from("cart_items").delete().eq("id", id);
    } else {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantidade: qty } : i)));
      await supabase.from("cart_items").update({ quantidade: qty }).eq("id", id);
    }
  }
  async function remover(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await supabase.from("cart_items").delete().eq("id", id);
  }
  async function limpar() {
    if (!confirm("Esvaziar carrinho?")) return;
    setItems([]);
    await supabase.from("cart_items").delete().eq("user_id", user.id);
  }

  const subtotal = items.reduce((s, i) => s + i.preco_unit_cents * i.quantidade, 0);
  const frete = estab?.taxa_entrega_cents ?? 0;
  const total = subtotal + frete;

  if (loading || loadedUserId !== user.id)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
        <ShoppingBag className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Seu carrinho está vazio.</p>
        <Button className="mt-4" onClick={() => navigate({ to: "/cliente" })}>
          Descobrir restaurantes
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Carrinho</h1>
          {estab && <p className="text-sm text-muted-foreground">{estab.nome}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={limpar}>
          Esvaziar
        </Button>
      </div>

      <div className="space-y-2">
        {items.map((i) => (
          <div key={i.id} className="flex gap-3 rounded-2xl border border-border bg-card p-3">
            <div className="flex-1">
              <p className="font-semibold">{i.nome_snapshot}</p>
              {i.addons.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {i.addons.map((a, idx) => (
                    <li key={`${a.id}-${idx}`} className="text-[11px] text-muted-foreground">
                      + {a.nome}
                      {a.preco_extra_cents > 0 && (
                        <span className="ml-1 text-primary/80">({fmt(a.preco_extra_cents)})</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {i.observacoes && (
                <p className="mt-0.5 text-xs italic text-muted-foreground">"{i.observacoes}"</p>
              )}
              <p className="mt-1 text-sm font-bold text-primary">
                {fmt(i.preco_unit_cents * i.quantidade)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="default"
                  className="h-7 w-7"
                  onClick={() => alterar(i.id, i.quantidade - 1)}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-6 text-center text-sm font-bold">{i.quantidade}</span>
                <Button
                  size="icon"
                  variant="default"
                  className="h-7 w-7"
                  onClick={() => alterar(i.id, i.quantidade + 1)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => remover(i.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium">Cupom (opcional)</label>
          {cupom && (
            <button
              onClick={() => setCupom("")}
              className="text-[11px] text-muted-foreground underline"
            >
              limpar
            </button>
          )}
        </div>
        <Input
          value={cupom}
          onChange={(e) => setCupom(e.target.value.toUpperCase())}
          placeholder="Ex: BEMVINDO10"
          className="mt-1"
        />
        {coupons.length > 0 ? (
          <div className="mt-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Cupons disponíveis
            </p>
            <div className="flex flex-wrap gap-2">
              {coupons.map((c) => {
                const active = cupom === c.code;
                const label =
                  c.type === "percent"
                    ? `${c.percent}% OFF`
                    : c.type === "fixed"
                      ? `${fmt(c.value_cents)} OFF`
                      : "Frete grátis";
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCupom(active ? "" : c.code)}
                    className={`group flex flex-col items-start rounded-xl border px-3 py-2 text-left transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground [&_.text-muted-foreground]:text-primary-foreground/90"
                        : "border-primary bg-background text-primary hover:bg-primary/10"
                    }`}
                  >
                    <span className="font-mono text-xs font-bold">{c.code}</span>
                    <span className="text-[11px] font-semibold">{label}</span>
                    {c.min_order_cents > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        mín. {fmt(c.min_order_cents)}
                      </span>
                    )}
                    {c.descricao && (
                      <span className="text-[10px] text-muted-foreground">{c.descricao}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground">Nenhum cupom ativo no momento.</p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-1.5 text-sm">
        <Row label="Subtotal" value={fmt(subtotal)} />
        <Row label="Entrega" value={frete === 0 ? "Grátis" : fmt(frete)} />
        <div className="my-2 border-t border-border" />
        <Row label="Total" value={fmt(total)} bold />
        {estab && subtotal < estab.pedido_minimo_cents && (
          <p className="mt-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
            Pedido mínimo desta loja: {fmt(estab.pedido_minimo_cents)}
          </p>
        )}
      </div>

      <Link to="/cliente/checkout" search={{ cupom: cupom || undefined }} className="block">
        <Button
          className="w-full"
          size="lg"
          disabled={!estab || subtotal < (estab?.pedido_minimo_cents ?? 0)}
          onClick={(e) => {
            if (!estab || subtotal < estab.pedido_minimo_cents) {
              e.preventDefault();
              toast.error("Verifique o pedido mínimo");
            }
          }}
        >
          {estab && subtotal < estab.pedido_minimo_cents
            ? `Faltam ${fmt(estab.pedido_minimo_cents - subtotal)} para continuar`
            : "Ir para o checkout"}
        </Button>
      </Link>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div
      className={`flex justify-between ${bold ? "text-base font-bold" : "text-muted-foreground"}`}
    >
      <span>{label}</span>
      <span className={bold ? "text-foreground" : ""}>{value}</span>
    </div>
  );
}
