import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus, Minus, Loader2, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/cliente/carrinho")({
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
type CouponRow = {
  id: string;
  code: string;
  type: "percent" | "fixed" | "free_delivery";
  value_cents: number;
  percent: number;
  min_order_cents: number;
  descricao: string | null;
  establishment_id: string | null;
  expires_at: string | null;
};

const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function CarrinhoPage() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [estab, setEstab] = useState<Estab | null>(null);
  const [cupom, setCupom] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("cart_items")
      .select("id,product_id,nome_snapshot,preco_unit_cents,quantidade,observacoes,establishment_id,addons")
      .eq("user_id", user.id)
      .order("created_at");
    const arr = ((data ?? []) as unknown as Item[]).map((i) => ({
      ...i,
      addons: Array.isArray(i.addons) ? i.addons : [],
    }));
    setItems(arr);
    if (arr[0]) {
      const { data: e } = await supabase
        .from("establishments")
        .select("id,nome,taxa_entrega_cents,pedido_minimo_cents")
        .eq("id", arr[0].establishment_id)
        .maybeSingle();
      setEstab(e as Estab | null);
    } else {
      setEstab(null);
    }
    setLoading(false);
  }

  async function alterar(id: string, qty: number) {
    if (qty <= 0) {
      await supabase.from("cart_items").delete().eq("id", id);
    } else {
      await supabase.from("cart_items").update({ quantidade: qty }).eq("id", id);
    }
    load();
  }
  async function remover(id: string) {
    await supabase.from("cart_items").delete().eq("id", id);
    load();
  }
  async function limpar() {
    if (!confirm("Esvaziar carrinho?")) return;
    await supabase.from("cart_items").delete().eq("user_id", user.id);
    load();
  }

  const subtotal = items.reduce((s, i) => s + i.preco_unit_cents * i.quantidade, 0);
  const frete = estab?.taxa_entrega_cents ?? 0;
  const total = subtotal + frete;

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
        <ShoppingBag className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Seu carrinho está vazio.</p>
        <Button className="mt-4" onClick={() => navigate({ to: "/cliente" })}>Descobrir restaurantes</Button>
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
        <Button variant="ghost" size="sm" onClick={limpar}>Esvaziar</Button>
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
              {i.observacoes && <p className="mt-0.5 text-xs italic text-muted-foreground">"{i.observacoes}"</p>}
              <p className="mt-1 text-sm font-bold text-primary">{fmt(i.preco_unit_cents * i.quantidade)}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => alterar(i.id, i.quantidade - 1)}><Minus className="h-3 w-3" /></Button>
                <span className="w-6 text-center text-sm font-bold">{i.quantidade}</span>
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => alterar(i.id, i.quantidade + 1)}><Plus className="h-3 w-3" /></Button>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => remover(i.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <label className="text-xs font-medium">Cupom (opcional)</label>
        <Input value={cupom} onChange={(e) => setCupom(e.target.value.toUpperCase())} placeholder="Ex: BEMVINDO10" className="mt-1" />
        <p className="mt-1 text-[11px] text-muted-foreground">Validaremos o cupom no checkout.</p>
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

      <Link
        to="/cliente/checkout"
        search={{ cupom: cupom || undefined }}
        className="block"
      >
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
          Ir para o checkout
        </Button>
      </Link>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "text-base font-bold" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span className={bold ? "text-foreground" : ""}>{value}</span>
    </div>
  );
}
