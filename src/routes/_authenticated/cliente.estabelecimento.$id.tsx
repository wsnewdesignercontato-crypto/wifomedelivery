import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Star, Clock, Heart, Plus, Minus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/cliente/estabelecimento/$id")({
  component: EstabelecimentoPage,
});

type Estab = {
  id: string;
  nome: string;
  descricao: string | null;
  logo_url: string | null;
  capa_url: string | null;
  taxa_entrega_cents: number;
  tempo_medio_min: number | null;
  pedido_minimo_cents: number;
  avaliacao: number | null;
  is_open: boolean;
  cidade: string | null;
};
type MenuCat = { id: string; nome: string; ordem: number };
type Produto = {
  id: string;
  nome: string;
  descricao: string | null;
  foto_url: string | null;
  preco_cents: number;
  preco_promo_cents: number | null;
  disponivel: boolean;
  menu_category_id: string | null;
  destaque: boolean;
};

const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function EstabelecimentoPage() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [estab, setEstab] = useState<Estab | null>(null);
  const [cats, setCats] = useState<MenuCat[]>([]);
  const [prods, setProds] = useState<Produto[]>([]);
  const [busca, setBusca] = useState("");
  const [fav, setFav] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openProd, setOpenProd] = useState<Produto | null>(null);
  const [qty, setQty] = useState(1);
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [e, c, p, f] = await Promise.all([
        supabase.from("establishments").select("*").eq("id", id).maybeSingle(),
        supabase.from("menu_categories").select("id,nome,ordem").eq("establishment_id", id).eq("ativo", true).order("ordem"),
        supabase.from("products").select("id,nome,descricao,foto_url,preco_cents,preco_promo_cents,disponivel,menu_category_id,destaque").eq("establishment_id", id).eq("disponivel", true).order("destaque", { ascending: false }).order("ordem"),
        supabase.from("favorites").select("id").eq("user_id", user.id).eq("establishment_id", id).maybeSingle(),
      ]);
      setEstab(e.data as Estab | null);
      setCats((c.data ?? []) as MenuCat[]);
      setProds((p.data ?? []) as Produto[]);
      setFav(!!f.data);
      setLoading(false);
    })();
  }, [id, user.id]);

  async function toggleFav() {
    if (fav) {
      await supabase.from("favorites").delete().eq("user_id", user.id).eq("establishment_id", id);
      setFav(false);
    } else {
      const { error } = await supabase.from("favorites").insert({ user_id: user.id, establishment_id: id });
      if (error) toast.error("Falha ao favoritar");
      else setFav(true);
    }
  }

  function abrirProd(p: Produto) {
    setOpenProd(p);
    setQty(1);
    setObs("");
  }

  async function adicionar() {
    if (!openProd || !estab) return;
    setSaving(true);
    // Se já há itens de outra loja, alerta
    const { data: existing } = await supabase
      .from("cart_items")
      .select("id,establishment_id")
      .eq("user_id", user.id)
      .limit(1);
    if (existing && existing[0] && existing[0].establishment_id !== estab.id) {
      const ok = confirm("Você já tem itens de outra loja no carrinho. Substituir?");
      if (!ok) { setSaving(false); return; }
      await supabase.from("cart_items").delete().eq("user_id", user.id);
    }
    const preco = openProd.preco_promo_cents ?? openProd.preco_cents;
    // Aumenta se já existe o mesmo produto
    const { data: same } = await supabase
      .from("cart_items")
      .select("id,quantidade")
      .eq("user_id", user.id)
      .eq("establishment_id", estab.id)
      .eq("product_id", openProd.id)
      .maybeSingle();
    if (same) {
      await supabase.from("cart_items").update({ quantidade: same.quantidade + qty, observacoes: obs || null }).eq("id", same.id);
    } else {
      await supabase.from("cart_items").insert({
        user_id: user.id,
        establishment_id: estab.id,
        product_id: openProd.id,
        nome_snapshot: openProd.nome,
        preco_unit_cents: preco,
        quantidade: qty,
        observacoes: obs || null,
      });
    }
    setSaving(false);
    setOpenProd(null);
    toast.success(`${openProd.nome} no carrinho`);
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!estab) {
    return <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">Estabelecimento não encontrado.</div>;
  }

  const q = busca.trim().toLowerCase();
  const visiveis = prods.filter((p) => !q || p.nome.toLowerCase().includes(q) || (p.descricao ?? "").toLowerCase().includes(q));
  const semCat = visiveis.filter((p) => !p.menu_category_id);

  return (
    <div className="space-y-4">
      <div className="relative -mx-4 h-40 overflow-hidden bg-gradient-to-br from-primary/25 to-primary/5 sm:mx-0 sm:rounded-2xl">
        {estab.capa_url && <img src={estab.capa_url} alt={estab.nome} className="h-full w-full object-cover" />}
        <Button size="icon" variant="secondary" className="absolute left-3 top-3" onClick={() => navigate({ to: "/cliente" })} aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="secondary" className="absolute right-3 top-3" onClick={toggleFav} aria-label="Favoritar">
          <Heart className={`h-4 w-4 ${fav ? "fill-primary text-primary" : ""}`} />
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-black text-foreground">{estab.nome}</h1>
        {estab.descricao && <p className="mt-1 text-sm text-muted-foreground">{estab.descricao}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {estab.avaliacao != null && (
            <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-primary text-primary" />{Number(estab.avaliacao).toFixed(1)}</span>
          )}
          {estab.tempo_medio_min && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{estab.tempo_medio_min} min</span>}
          <span>Entrega {estab.taxa_entrega_cents === 0 ? "grátis" : fmt(estab.taxa_entrega_cents)}</span>
          {estab.pedido_minimo_cents > 0 && <span>Mín. {fmt(estab.pedido_minimo_cents)}</span>}
          {!estab.is_open && <Badge variant="secondary">Fechado agora</Badge>}
        </div>
      </div>

      <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no cardápio" />

      {cats.map((c) => {
        const itens = visiveis.filter((p) => p.menu_category_id === c.id);
        if (itens.length === 0) return null;
        return (
          <section key={c.id} className="space-y-2">
            <h2 className="text-base font-bold">{c.nome}</h2>
            <div className="grid gap-2">
              {itens.map((p) => <ProdRow key={p.id} p={p} onClick={() => abrirProd(p)} />)}
            </div>
          </section>
        );
      })}
      {semCat.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-bold">Outros</h2>
          <div className="grid gap-2">
            {semCat.map((p) => <ProdRow key={p.id} p={p} onClick={() => abrirProd(p)} />)}
          </div>
        </section>
      )}
      {visiveis.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhum item disponível.
        </div>
      )}

      <Dialog open={!!openProd} onOpenChange={(o) => !o && setOpenProd(null)}>
        <DialogContent className="max-w-lg">
          {openProd && (
            <>
              <DialogHeader>
                <DialogTitle>{openProd.nome}</DialogTitle>
              </DialogHeader>
              {openProd.foto_url && <img src={openProd.foto_url} alt={openProd.nome} className="h-40 w-full rounded-lg object-cover" />}
              {openProd.descricao && <p className="text-sm text-muted-foreground">{openProd.descricao}</p>}
              <div className="text-lg font-bold text-primary">
                {fmt(openProd.preco_promo_cents ?? openProd.preco_cents)}
                {openProd.preco_promo_cents != null && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground line-through">{fmt(openProd.preco_cents)}</span>
                )}
              </div>
              <div>
                <label className="text-xs font-medium">Observações</label>
                <Textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex: sem cebola" maxLength={200} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" onClick={() => setQty(Math.max(1, qty - 1))}><Minus className="h-4 w-4" /></Button>
                  <span className="w-8 text-center font-bold">{qty}</span>
                  <Button size="icon" variant="outline" onClick={() => setQty(qty + 1)}><Plus className="h-4 w-4" /></Button>
                </div>
                <DialogFooter>
                  <Button onClick={adicionar} disabled={saving || !estab.is_open}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Adicionar · ${fmt((openProd.preco_promo_cents ?? openProd.preco_cents) * qty)}`}
                  </Button>
                </DialogFooter>
              </div>
              {!estab.is_open && <p className="text-xs text-destructive">Loja fechada. Não é possível adicionar agora.</p>}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProdRow({ p, onClick }: { p: Produto; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex gap-3 rounded-2xl border border-border bg-card p-3 text-left transition hover:border-primary/40">
      <div className="flex-1">
        <p className="font-semibold text-foreground">{p.nome}</p>
        {p.descricao && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.descricao}</p>}
        <p className="mt-1 text-sm font-bold text-primary">
          {fmt(p.preco_promo_cents ?? p.preco_cents)}
          {p.preco_promo_cents != null && (
            <span className="ml-2 text-xs font-normal text-muted-foreground line-through">{fmt(p.preco_cents)}</span>
          )}
        </p>
      </div>
      {p.foto_url ? (
        <img src={p.foto_url} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" loading="lazy" />
      ) : (
        <div className="h-20 w-20 shrink-0 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5" />
      )}
    </button>
  );
}
