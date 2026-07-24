import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Star, Clock, Heart, Plus, Minus, Loader2, Check, MessageSquare } from "lucide-react";
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
} from "@/components/ui/dialog";
import { EstabReviewsPanel, ReviewForm } from "@/components/reviews";

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
type Addon = {
  id: string;
  nome: string;
  descricao: string | null;
  preco_extra_cents: number;
  ordem: number;
};
type AddonGroup = {
  id: string;
  nome: string;
  descricao: string | null;
  minimo: number;
  maximo: number;
  obrigatorio: boolean;
  selecao_multipla: boolean;
  ordem: number;
  addons: Addon[];
};
type SavedAddon = {
  id: string;
  nome: string;
  preco_extra_cents: number;
  group_id: string;
  group_nome: string;
};

const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function EstabelecimentoPage() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [estab, setEstab] = useState<Estab | null>(null);
  const [reviewCount, setReviewCount] = useState<number>(0);
  const [cats, setCats] = useState<MenuCat[]>([]);
  const [prods, setProds] = useState<Produto[]>([]);
  const [busca, setBusca] = useState("");
  const [fav, setFav] = useState(false);
  const [loading, setLoading] = useState(true);

  const [openProd, setOpenProd] = useState<Produto | null>(null);
  const [qty, setQty] = useState(1);
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<AddonGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  // seleção: groupId -> lista de addonIds
  const [sel, setSel] = useState<Record<string, string[]>>({});

  const [openReview, setOpenReview] = useState(false);
  const [pendingReview, setPendingReview] = useState<{ order_id: string; entregador_id: string | null } | null>(null);
  const [reviewsBump, setReviewsBump] = useState(0);

  useEffect(() => {
    if (!user?.id || !id) return;
    (async () => {
      const { data: orders } = await supabase
        .from("orders")
        .select("id")
        .eq("cliente_id", user.id)
        .eq("establishment_id", id)
        .eq("status", "delivered")
        .order("created_at", { ascending: false })
        .limit(10);
      if (!orders?.length) { setPendingReview(null); return; }
      const ids = orders.map((o) => o.id);
      const { data: revs } = await supabase
        .from("reviews")
        .select("order_id")
        .in("order_id", ids);
      const reviewed = new Set((revs ?? []).map((r) => r.order_id));
      const pending = orders.find((o) => !reviewed.has(o.id));
      if (!pending) { setPendingReview(null); return; }
      const { data: del } = await supabase
        .from("deliveries")
        .select("entregador_id")
        .eq("order_id", pending.id)
        .maybeSingle();
      setPendingReview({ order_id: pending.id, entregador_id: del?.entregador_id ?? null });
    })();
  }, [user?.id, id, reviewsBump]);


  useEffect(() => {
    (async () => {
      setLoading(true);
      const [e, c, p, f, rc] = await Promise.all([
        supabase.from("establishments").select("*").eq("id", id).maybeSingle(),
        supabase.from("menu_categories").select("id,nome,ordem").eq("establishment_id", id).eq("ativo", true).order("ordem"),
        supabase.from("products").select("id,nome,descricao,foto_url,preco_cents,preco_promo_cents,disponivel,menu_category_id,destaque").eq("establishment_id", id).eq("disponivel", true).order("destaque", { ascending: false }).order("ordem"),
        supabase.from("favorites").select("id").eq("user_id", user.id).eq("establishment_id", id).maybeSingle(),
        supabase.from("reviews").select("id", { count: "exact", head: true }).eq("establishment_id", id),
      ]);
      setEstab(e.data as Estab | null);
      setCats((c.data ?? []) as MenuCat[]);
      setProds((p.data ?? []) as Produto[]);
      setFav(!!f.data);
      setReviewCount(rc.count ?? 0);
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

  async function abrirProd(p: Produto) {
    setOpenProd(p);
    setQty(1);
    setObs("");
    setSel({});
    setGroups([]);
    setLoadingGroups(true);
    // Busca grupos vinculados ao produto + seus addons ativos
    const { data: pag } = await supabase
      .from("product_addon_groups")
      .select("ordem,addon_group_id,addon_groups(id,nome,descricao,minimo,maximo,obrigatorio,selecao_multipla,ordem,ativo)")
      .eq("product_id", p.id)
      .order("ordem");
    type Row = {
      ordem: number;
      addon_group_id: string;
      addon_groups:
        | (Omit<AddonGroup, "addons"> & { ativo: boolean })
        | null;
    };
    const rows = ((pag ?? []) as unknown as Row[]).filter(
      (r) => r.addon_groups && r.addon_groups.ativo,
    );
    if (rows.length === 0) {
      setGroups([]);
      setLoadingGroups(false);
      return;
    }
    const groupIds = rows.map((r) => r.addon_group_id);
    const { data: adns } = await supabase
      .from("addons")
      .select("id,nome,descricao,preco_extra_cents,ordem,addon_group_id,ativo")
      .in("addon_group_id", groupIds)
      .eq("ativo", true)
      .order("ordem");
    const byGroup = new Map<string, Addon[]>();
    (adns ?? []).forEach((a) => {
      const arr = byGroup.get(a.addon_group_id) ?? [];
      arr.push({
        id: a.id,
        nome: a.nome,
        descricao: a.descricao,
        preco_extra_cents: a.preco_extra_cents,
        ordem: a.ordem,
      });
      byGroup.set(a.addon_group_id, arr);
    });
    const built: AddonGroup[] = rows
      .map((r) => ({
        id: r.addon_groups!.id,
        nome: r.addon_groups!.nome,
        descricao: r.addon_groups!.descricao,
        minimo: r.addon_groups!.minimo,
        maximo: r.addon_groups!.maximo,
        obrigatorio: r.addon_groups!.obrigatorio,
        selecao_multipla: r.addon_groups!.selecao_multipla,
        ordem: r.addon_groups!.ordem,
        addons: byGroup.get(r.addon_group_id) ?? [],
      }))
      .filter((g) => g.addons.length > 0);
    setGroups(built);
    setLoadingGroups(false);
  }

  function toggleAddon(g: AddonGroup, addonId: string) {
    setSel((prev) => {
      const cur = prev[g.id] ?? [];
      const has = cur.includes(addonId);
      let next: string[];
      if (g.selecao_multipla) {
        if (has) next = cur.filter((x) => x !== addonId);
        else if (g.maximo > 0 && cur.length >= g.maximo)
          next = cur; // limite atingido
        else next = [...cur, addonId];
      } else {
        next = has ? [] : [addonId];
      }
      return { ...prev, [g.id]: next };
    });
  }

  const chosen: SavedAddon[] = useMemo(() => {
    const out: SavedAddon[] = [];
    for (const g of groups) {
      const ids = sel[g.id] ?? [];
      for (const aid of ids) {
        const a = g.addons.find((x) => x.id === aid);
        if (a) out.push({ id: a.id, nome: a.nome, preco_extra_cents: a.preco_extra_cents, group_id: g.id, group_nome: g.nome });
      }
    }
    return out;
  }, [sel, groups]);

  const extras = chosen.reduce((s, a) => s + a.preco_extra_cents, 0);
  const precoBase = openProd ? (openProd.preco_promo_cents ?? openProd.preco_cents) : 0;
  const precoUnit = precoBase + extras;

  const invalid = useMemo(() => {
    for (const g of groups) {
      const n = (sel[g.id] ?? []).length;
      if (g.obrigatorio && n < Math.max(1, g.minimo)) return `Escolha "${g.nome}"`;
      if (g.minimo > 0 && n < g.minimo) return `Escolha ao menos ${g.minimo} em "${g.nome}"`;
      if (g.maximo > 0 && n > g.maximo) return `Máximo ${g.maximo} em "${g.nome}"`;
    }
    return null;
  }, [groups, sel]);

  async function adicionar() {
    if (!openProd || !estab) return;
    if (invalid) { toast.error(invalid); return; }
    setSaving(true);
    // Bloqueia mistura de lojas
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
    // Sempre insere linha nova quando há opcionais ou observações
    // (para não misturar combinações diferentes do mesmo produto)
    const temCustom = chosen.length > 0 || !!obs.trim();
    if (!temCustom) {
      const { data: same } = await supabase
        .from("cart_items")
        .select("id,quantidade,addons")
        .eq("user_id", user.id)
        .eq("establishment_id", estab.id)
        .eq("product_id", openProd.id)
        .maybeSingle();
      if (same && Array.isArray(same.addons) && (same.addons as unknown[]).length === 0) {
        await supabase.from("cart_items").update({ quantidade: same.quantidade + qty }).eq("id", same.id);
        setSaving(false); setOpenProd(null);
        toast.success(`${openProd.nome} no carrinho`);
        return;
      }
    }
    await supabase.from("cart_items").insert({
      user_id: user.id,
      establishment_id: estab.id,
      product_id: openProd.id,
      nome_snapshot: openProd.nome,
      preco_unit_cents: precoUnit,
      quantidade: qty,
      observacoes: obs || null,
      addons: chosen,
    });
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
      {/* COVER (capa) — vitrine premium */}
      <div className="relative -mx-4 h-48 overflow-hidden bg-gradient-to-br from-primary/25 to-primary/5 sm:mx-0 sm:h-56 sm:rounded-2xl">
        {estab.capa_url ? (
          <img src={estab.capa_url} alt={estab.nome} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/30 via-primary/10 to-transparent" />
        )}
        {/* Gradient overlay to make logo readable */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <Button size="icon" variant="secondary" className="absolute left-3 top-3 rounded-full shadow-lg backdrop-blur" onClick={() => navigate({ to: "/cliente" })} aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="secondary" className="absolute right-3 top-3 rounded-full shadow-lg backdrop-blur" onClick={toggleFav} aria-label="Favoritar">
          <Heart className={`h-4 w-4 ${fav ? "fill-primary text-primary" : ""}`} />
        </Button>
      </div>

      {/* LOGO (vitrine) — círculo sobreposto à capa */}
      <div className="-mt-14 flex items-end gap-4 sm:-mt-16">
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-2xl bg-primary/30 blur-xl" aria-hidden />
          <div className="relative h-24 w-24 overflow-hidden rounded-2xl border-4 border-background bg-card shadow-xl sm:h-28 sm:w-28">
            {estab.logo_url ? (
              <img src={estab.logo_url} alt={estab.nome} className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center bg-gradient-to-br from-primary to-primary/70 text-2xl font-black text-primary-foreground">
                {estab.nome.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1 pb-1">
          {estab.is_open ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_theme(colors.emerald.500)]" />
              Aberto agora
            </span>
          ) : (
            <Badge variant="secondary" className="text-[11px]">Fechado agora</Badge>
          )}
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-black text-foreground">{estab.nome}</h1>
        {estab.descricao && <p className="mt-1 text-sm text-muted-foreground">{estab.descricao}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {estab.avaliacao != null && (
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-primary text-primary" />
              <span className="font-semibold text-foreground">{Number(estab.avaliacao).toFixed(1)}</span>
              <span className="text-muted-foreground">({reviewCount})</span>
            </span>
          )}
          {estab.tempo_medio_min && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{estab.tempo_medio_min} min</span>}
          <span>Entrega {estab.taxa_entrega_cents === 0 ? "grátis" : fmt(estab.taxa_entrega_cents)}</span>
          {estab.pedido_minimo_cents > 0 && <span>Mín. {fmt(estab.pedido_minimo_cents)}</span>}
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
          {openProd && (
            <div className="flex flex-col">
              {openProd.foto_url && (
                <img src={openProd.foto_url} alt={openProd.nome} className="h-48 w-full object-cover" />
              )}
              <div className="space-y-4 p-5 pb-32">
                <DialogHeader>
                  <DialogTitle className="text-xl">{openProd.nome}</DialogTitle>
                </DialogHeader>
                {openProd.descricao && (
                  <p className="text-sm text-muted-foreground">{openProd.descricao}</p>
                )}
                <div className="text-lg font-bold text-primary">
                  {fmt(precoBase)}
                  {openProd.preco_promo_cents != null && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground line-through">{fmt(openProd.preco_cents)}</span>
                  )}
                </div>

                {loadingGroups && (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  </div>
                )}

                {!loadingGroups && groups.map((g) => {
                  const cur = sel[g.id] ?? [];
                  return (
                    <div key={g.id} className="rounded-xl border border-border">
                      <div className="flex items-start justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold">{g.nome}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {g.obrigatorio && <span className="font-semibold text-primary">Obrigatório · </span>}
                            {g.selecao_multipla
                              ? g.maximo > 0
                                ? `Escolha até ${g.maximo}`
                                : "Escolha quantos quiser"
                              : "Escolha 1"}
                            {g.minimo > 0 && !g.obrigatorio && ` · Mín. ${g.minimo}`}
                          </p>
                        </div>
                        {g.obrigatorio && (
                          <Badge variant={cur.length >= Math.max(1, g.minimo) ? "default" : "secondary"} className="text-[10px]">
                            {cur.length >= Math.max(1, g.minimo) ? "OK" : "Escolha"}
                          </Badge>
                        )}
                      </div>
                      <div className="divide-y divide-border">
                        {g.addons.map((a) => {
                          const active = cur.includes(a.id);
                          const disabled =
                            !active &&
                            g.selecao_multipla &&
                            g.maximo > 0 &&
                            cur.length >= g.maximo;
                          return (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => !disabled && toggleAddon(g, a.id)}
                              disabled={disabled}
                              className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors ${
                                active ? "bg-primary/5" : "hover:bg-muted/40"
                              } ${disabled ? "opacity-40" : ""}`}
                            >
                              <div
                                className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 ${
                                  g.selecao_multipla ? "rounded" : "rounded-full"
                                } ${active ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                              >
                                {active && <Check className="h-3 w-3" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold">{a.nome}</p>
                                {a.descricao && (
                                  <p className="text-[11px] text-muted-foreground">{a.descricao}</p>
                                )}
                              </div>
                              {a.preco_extra_cents > 0 ? (
                                <span className="text-sm font-bold text-primary">
                                  +{fmt(a.preco_extra_cents)}
                                </span>
                              ) : (
                                <span className="text-xs font-medium text-muted-foreground">Grátis</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                <div>
                  <label className="text-xs font-medium">Alguma observação?</label>
                  <Textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex: sem cebola, ponto da carne, troco para..." maxLength={200} />
                </div>
              </div>

              {/* Rodapé fixo */}
              <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-background p-4">
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" onClick={() => setQty(Math.max(1, qty - 1))}><Minus className="h-4 w-4" /></Button>
                  <span className="w-6 text-center font-bold">{qty}</span>
                  <Button size="icon" variant="outline" onClick={() => setQty(qty + 1)}><Plus className="h-4 w-4" /></Button>
                </div>
                <Button
                  className="flex-1"
                  onClick={adicionar}
                  disabled={saving || !estab.is_open || !!invalid}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="flex w-full items-center justify-between gap-2">
                      <span>Adicionar</span>
                      <span className="font-black">{fmt(precoUnit * qty)}</span>
                    </span>
                  )}
                </Button>
              </div>

              {!estab.is_open && <p className="px-4 pb-3 text-xs text-destructive">Loja fechada. Não é possível adicionar agora.</p>}
              {invalid && estab.is_open && (
                <p className="px-4 pb-3 text-xs text-muted-foreground">{invalid}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProdRow({ p, onClick }: { p: Produto; onClick: () => void }) {
  const fmt2 = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <button onClick={onClick} className="flex gap-3 rounded-2xl border border-border bg-card p-3 text-left transition hover:border-primary/40">
      <div className="flex-1">
        <p className="font-semibold text-foreground">{p.nome}</p>
        {p.descricao && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.descricao}</p>}
        <p className="mt-1 text-sm font-bold text-primary">
          {fmt2(p.preco_promo_cents ?? p.preco_cents)}
          {p.preco_promo_cents != null && (
            <span className="ml-2 text-xs font-normal text-muted-foreground line-through">{fmt2(p.preco_cents)}</span>
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
