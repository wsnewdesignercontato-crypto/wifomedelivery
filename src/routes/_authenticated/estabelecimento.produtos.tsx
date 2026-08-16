import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab, fmt } from "@/hooks/use-my-estab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Copy,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Store,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  getCategoryKind,
  KIND_LABEL,
  KIND_HINT,
  ADDON_TEMPLATES,
  VARIANT_TEMPLATES,
  EXTRA_FIELDS,
} from "@/lib/category-templates";

export const Route = createFileRoute("/_authenticated/estabelecimento/produtos")({
  component: ProdutosPage,
});

type Categoria = { id: string; nome: string };
type Produto = {
  id: string;
  nome: string;
  descricao: string | null;
  preco_cents: number;
  preco_promo_cents?: number | null;
  foto_url: string | null;
  disponivel: boolean;
  estoque?: number | null;
  menu_category_id?: string | null;
  tempo_preparo_min?: number | null;
};

function ProdutosPage() {
  const { estab } = useMyEstab();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [cats, setCats] = useState<Categoria[]>([]);
  const [addonGroups, setAddonGroups] = useState<{ id: string; nome: string }[]>([]);
  const [busca, setBusca] = useState("");
  const [filterCat, setFilterCat] = useState<string>("todas");
  const [editing, setEditing] = useState<Produto | null>(null);
  const [openNew, setOpenNew] = useState(false);

  async function reload() {
    if (!estab) return;
    const { data } = await supabase
      .from("products")
      .select(
        "id,nome,descricao,preco_cents,preco_promo_cents,foto_url,disponivel,estoque,menu_category_id,tempo_preparo_min",
      )
      .eq("establishment_id", estab.id)
      .order("created_at", { ascending: false });
    setProdutos((data ?? []) as Produto[]);
    const { data: c } = await supabase
      .from("menu_categories")
      .select("id,nome")
      .eq("establishment_id", estab.id)
      .order("ordem");
    setCats((c ?? []) as Categoria[]);
    const { data: ag } = await supabase
      .from("addon_groups")
      .select("id,nome")
      .eq("establishment_id", estab.id)
      .order("nome");
    setAddonGroups((ag ?? []) as { id: string; nome: string }[]);
  }
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estab?.id]);

  async function toggle(p: Produto) {
    await supabase.from("products").update({ disponivel: !p.disponivel }).eq("id", p.id);
    reload();
  }
  async function remover(id: string) {
    if (!confirm("Excluir produto?")) return;
    await supabase.from("products").delete().eq("id", id);
    reload();
  }
  async function duplicar(p: Produto) {
    if (!estab) return;
    const { error } = await supabase.from("products").insert({
      establishment_id: estab.id,
      nome: p.nome + " (cópia)",
      descricao: p.descricao,
      preco_cents: p.preco_cents,
      preco_promo_cents: p.preco_promo_cents,
      foto_url: p.foto_url,
      disponivel: false,
      menu_category_id: p.menu_category_id,
      estoque: p.estoque,
      tempo_preparo_min: p.tempo_preparo_min,
    });
    if (error) toast.error("Falha ao duplicar");
    else {
      toast.success("Duplicado");
      reload();
    }
  }

  const filtrados = produtos.filter(
    (p) =>
      (filterCat === "todas" || p.menu_category_id === filterCat) &&
      (!busca || p.nome.toLowerCase().includes(busca.toLowerCase())),
  );
  const summary = useMemo(() => {
    const ativos = produtos.filter((p) => p.disponivel).length;
    const emPromo = produtos.filter((p) => p.preco_promo_cents != null).length;
    const estoqueBaixo = produtos.filter((p) => p.estoque != null && p.estoque <= 5).length;
    return { ativos, emPromo, estoqueBaixo };
  }, [produtos]);

  return (
    <div className="space-y-5">
      <section className="card-premium relative overflow-hidden border-none bg-gradient-to-br from-primary/12 via-white to-primary/5 p-5 dark:from-primary/15 dark:via-card dark:to-primary/10 sm:p-6">
        <div className="absolute -left-10 top-0 h-36 w-36 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -right-10 bottom-0 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative grid gap-6 xl:grid-cols-[1.14fr_0.86fr] xl:items-start">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary text-primary-foreground">Catalogo premium</Badge>
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                Gestao da loja
              </Badge>
              <span className="text-xs font-semibold text-muted-foreground">
                {produtos.length} produtos cadastrados
              </span>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-muted-foreground">
                Mais clareza para organizar precos, estoque, promocoes e disponibilidade.
              </p>
              <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
                Seu cardapio com visual mais premium e operacao mais forte.
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                Controle a vitrine da loja com filtros mais inteligentes, cards mais claros e edicao
                mais organizada.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <HeroMetric label="Produtos" value={String(produtos.length)} hint="Catalogo atual" />
              <HeroMetric
                label="Ativos"
                value={String(summary.ativos)}
                hint="Disponiveis para venda"
              />
              <HeroMetric
                label="Em promo"
                value={String(summary.emPromo)}
                hint="Com preco promocional"
              />
              <HeroMetric
                label="Estoque baixo"
                value={String(summary.estoqueBaixo)}
                hint="Itens que pedem atencao"
              />
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-card backdrop-blur dark:border-border dark:bg-card/90">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-muted-foreground">
                  Acao rapida
                </p>
                <p className="mt-2 text-2xl font-black text-foreground">
                  {filtrados.length} itens nesta visao
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Package className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Filtro atual
                </p>
                <p className="mt-1 font-bold text-foreground">
                  {filterCat === "todas"
                    ? "Todas as categorias"
                    : (cats.find((c) => c.id === filterCat)?.nome ?? "Categoria")}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Busca
                </p>
                <p className="mt-1 font-bold text-foreground">
                  {busca ? `"${busca}"` : "Sem termo ativo"}
                </p>
              </div>
            </div>

            <Dialog open={openNew} onOpenChange={setOpenNew}>
              <DialogTrigger asChild>
                <Button className="mt-4 w-full rounded-full">
                  <Plus className="mr-2 h-4 w-4" />
                  Novo produto
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Novo produto</DialogTitle>
                </DialogHeader>
                <ProdutoForm
                  cats={cats}
                  addonGroups={addonGroups}
                  onSaved={() => {
                    setOpenNew(false);
                    reload();
                  }}
                />
              </DialogContent>
            </Dialog>

            <div className="mt-4 rounded-2xl border border-border/70 bg-background/70 p-3">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Cardapio premium
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                Destaque promocao, disponibilidade, categoria e preparo sem poluir a tela.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="card-premium border-none bg-gradient-to-br from-card to-muted/20 p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar produto..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              {cats.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {filtrados.length === 0 ? (
        <div className="card-premium rounded-[1.75rem] border-dashed p-10 text-center text-sm text-muted-foreground">
          Nenhum produto encontrado.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((p) => {
            const categoryName =
              cats.find((c) => c.id === p.menu_category_id)?.nome ?? "Sem categoria";
            const hasPromo = p.preco_promo_cents != null && p.preco_promo_cents < p.preco_cents;
            const lowStock = p.estoque != null && p.estoque <= 5;

            return (
              <div
                key={p.id}
                className="card-premium rounded-[1.75rem] border-none bg-gradient-to-br from-card to-muted/20 p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[1.25rem] bg-muted ring-1 ring-border/60">
                    {p.foto_url ? (
                      <img src={p.foto_url} alt={p.nome} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-primary/10 text-primary">
                        <Store className="h-6 w-6" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-primary/30 bg-primary/10 text-primary"
                      >
                        {categoryName}
                      </Badge>
                      {!p.disponivel && (
                        <Badge variant="secondary" className="text-xs">
                          Off
                        </Badge>
                      )}
                      {lowStock && (
                        <Badge variant="destructive" className="text-xs">
                          Estoque {p.estoque}
                        </Badge>
                      )}
                    </div>
                    <h2 className="mt-3 truncate text-xl font-black tracking-tight text-foreground">
                      {p.nome}
                    </h2>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {p.descricao?.replace(/\s*\[\[extras:[^\]]+\]\]\s*$/, "") ||
                        "Produto com informacoes mais claras para o cliente decidir melhor."}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1.35rem] border border-border/70 bg-background/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      Preco
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-lg font-black text-primary">
                        {fmt(hasPromo ? (p.preco_promo_cents ?? p.preco_cents) : p.preco_cents)}
                      </span>
                      {hasPromo && (
                        <span className="text-sm text-muted-foreground line-through">
                          {fmt(p.preco_cents)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-[1.35rem] border border-border/70 bg-background/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      Operacao
                    </p>
                    <p className="mt-1 text-sm font-bold text-foreground">
                      {p.tempo_preparo_min
                        ? `${p.tempo_preparo_min} min de preparo`
                        : "Tempo nao informado"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.disponivel ? "Disponivel para venda" : "Pausado no cardapio"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <Switch checked={p.disponivel} onCheckedChange={() => toggle(p)} />
                  <span>{p.disponivel ? "Exibindo no app" : "Oculto temporariamente"}</span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => setEditing(p)}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => duplicar(p)}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => remover(p.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                    Remover
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Editar produto</DialogTitle>
          </DialogHeader>
          {editing && (
            <ProdutoForm
              cats={cats}
              addonGroups={addonGroups}
              produto={editing}
              onSaved={() => {
                setEditing(null);
                reload();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
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

type Variant = {
  id?: string;
  nome: string;
  preco_cents: number;
  ativo: boolean;
  ordem: number;
  _new?: boolean;
  _deleted?: boolean;
};

function ProdutoForm({
  cats,
  addonGroups,
  produto,
  onSaved,
}: {
  cats: Categoria[];
  addonGroups: { id: string; nome: string }[];
  produto?: Produto;
  onSaved: () => void;
}) {
  const { estab } = useMyEstab();
  const [form, setForm] = useState({
    nome: produto?.nome ?? "",
    descricao: produto?.descricao ?? "",
    preco: produto ? (produto.preco_cents / 100).toFixed(2) : "",
    preco_promo: produto?.preco_promo_cents ? (produto.preco_promo_cents / 100).toFixed(2) : "",
    foto_url: produto?.foto_url ?? "",
    menu_category_id: produto?.menu_category_id ?? "",
    estoque: produto?.estoque?.toString() ?? "",
    tempo: produto?.tempo_preparo_min?.toString() ?? "",
    disponivel: produto?.disponivel ?? true,
  });
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [variants, setVariants] = useState<Variant[]>([]);
  const [saving, setSaving] = useState(false);
  const [applyingTpl, setApplyingTpl] = useState(false);

  const catNome = cats.find((c) => c.id === form.menu_category_id)?.nome;
  const kind = getCategoryKind(catNome);
  const extraDefs = EXTRA_FIELDS[kind];
  const addonTpl = ADDON_TEMPLATES[kind];
  const variantTpl = VARIANT_TEMPLATES[kind];

  useEffect(() => {
    if (!produto?.id) return;
    supabase
      .from("product_addon_groups")
      .select("addon_group_id")
      .eq("product_id", produto.id)
      .then(({ data }) => {
        setSelectedGroups(
          new Set((data ?? []).map((r) => (r as { addon_group_id: string }).addon_group_id)),
        );
      });
    supabase
      .from("product_variants")
      .select("id,nome,preco_cents,ativo,ordem")
      .eq("product_id", produto.id)
      .order("ordem")
      .then(({ data }) => {
        setVariants(((data ?? []) as Variant[]).map((v) => ({ ...v, _new: false })));
      });
    // Parse extras from descricao trailing block  [[extras: k=v; ...]]
    const m = /\[\[extras:([^\]]+)\]\]/.exec(produto.descricao ?? "");
    if (m) {
      const obj: Record<string, string> = {};
      m[1].split(";").forEach((p) => {
        const [k, ...rest] = p.split("=");
        if (k && rest.length) obj[k.trim()] = rest.join("=").trim();
      });
      setExtras(obj);
    }
  }, [produto?.id, produto?.descricao]);

  function toggleGroup(id: string) {
    setSelectedGroups((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function aplicarTemplateComplementos() {
    if (!estab) return;
    if (!addonTpl.length) return toast.info("Sem template para esta categoria");
    setApplyingTpl(true);
    const newIds: string[] = [];
    for (const tpl of addonTpl) {
      // Reusar grupo existente com mesmo nome, senão criar
      const existing = addonGroups.find((g) => g.nome.toLowerCase() === tpl.nome.toLowerCase());
      let gid = existing?.id;
      if (!gid) {
        const { data, error } = await supabase
          .from("addon_groups")
          .insert({
            establishment_id: estab.id,
            nome: tpl.nome,
            obrigatorio: tpl.obrigatorio,
            minimo: tpl.minimo,
            maximo: tpl.maximo,
          })
          .select("id")
          .single();
        if (error || !data) continue;
        gid = data.id;
        const rows = tpl.itens.map((it, i) => ({
          addon_group_id: gid!,
          nome: it.nome,
          preco_extra_cents: it.preco_extra_cents,
          ordem: i,
        }));
        if (rows.length) await supabase.from("addons").insert(rows);
      }
      newIds.push(gid);
    }
    setSelectedGroups((prev) => {
      const n = new Set(prev);
      newIds.forEach((id) => n.add(id));
      return n;
    });
    setApplyingTpl(false);
    toast.success(`Template de ${KIND_LABEL[kind]} aplicado (${newIds.length} grupos)`);
  }

  function aplicarTemplateVariacoes() {
    if (!variantTpl.length) return;
    const base = Math.max(...variants.filter((v) => !v._deleted).map((v) => v.ordem), -1) + 1;
    const novas = variantTpl.map((v, i) => ({
      nome: v.nome,
      preco_cents: v.preco_cents,
      ativo: true,
      ordem: base + i,
      _new: true,
    }));
    setVariants((prev) => [...prev, ...novas]);
    toast.success(`${novas.length} variações adicionadas — ajuste os preços e salve`);
  }

  function addVariant() {
    const ordem = Math.max(...variants.map((v) => v.ordem), -1) + 1;
    setVariants((v) => [...v, { nome: "", preco_cents: 0, ativo: true, ordem, _new: true }]);
  }
  function updVariant(i: number, patch: Partial<Variant>) {
    setVariants((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  }
  function delVariant(i: number) {
    setVariants((prev) => prev.map((v, idx) => (idx === i ? { ...v, _deleted: true } : v)));
  }

  async function salvar() {
    if (!estab || !form.nome.trim() || !form.preco) return toast.error("Nome e preço obrigatórios");
    setSaving(true);
    // Serializa extras dentro do descricao como bloco discreto no fim
    const descRaw = (form.descricao ?? "").replace(/\s*\[\[extras:[^\]]+\]\]\s*$/, "").trim();
    const extraEntries = Object.entries(extras).filter(([, v]) => (v ?? "").trim() !== "");
    const descFinal = extraEntries.length
      ? `${descRaw}${descRaw ? "\n\n" : ""}[[extras:${extraEntries.map(([k, v]) => `${k}=${v.replace(/[;\]]/g, "")}`).join(";")}]]`
      : descRaw;

    const payload = {
      establishment_id: estab.id,
      nome: form.nome.trim(),
      descricao: descFinal || null,
      preco_cents: Math.round(parseFloat(form.preco) * 100),
      preco_promo_cents: form.preco_promo ? Math.round(parseFloat(form.preco_promo) * 100) : null,
      foto_url: form.foto_url || null,
      menu_category_id: form.menu_category_id || null,
      estoque: form.estoque ? parseInt(form.estoque) : null,
      tempo_preparo_min: form.tempo ? parseInt(form.tempo) : null,
      disponivel: form.disponivel,
    };
    let productId = produto?.id;
    if (produto) {
      const { error } = await supabase.from("products").update(payload).eq("id", produto.id);
      if (error) {
        setSaving(false);
        return toast.error("Falha ao salvar");
      }
    } else {
      const { data, error } = await supabase.from("products").insert(payload).select("id").single();
      if (error || !data) {
        setSaving(false);
        return toast.error("Falha ao salvar");
      }
      productId = data.id;
    }
    if (productId) {
      await supabase.from("product_addon_groups").delete().eq("product_id", productId);
      const rows = Array.from(selectedGroups).map((gid) => ({
        product_id: productId!,
        addon_group_id: gid,
      }));
      if (rows.length) await supabase.from("product_addon_groups").insert(rows);

      // Variantes
      for (const v of variants) {
        if (v._deleted && v.id) {
          await supabase.from("product_variants").delete().eq("id", v.id);
        } else if (v._new && !v._deleted && v.nome.trim()) {
          await supabase.from("product_variants").insert({
            product_id: productId!,
            nome: v.nome.trim(),
            preco_cents: v.preco_cents,
            ativo: v.ativo,
            ordem: v.ordem,
          });
        } else if (v.id && !v._deleted) {
          await supabase
            .from("product_variants")
            .update({
              nome: v.nome.trim(),
              preco_cents: v.preco_cents,
              ativo: v.ativo,
              ordem: v.ordem,
            })
            .eq("id", v.id);
        }
      }
    }
    setSaving(false);
    toast.success("Produto salvo");
    onSaved();
  }

  return (
    <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
      <div className="card-premium border-none bg-gradient-to-br from-primary/10 via-card to-primary/5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Edicao premium
            </p>
            <p className="mt-2 text-xl font-black text-foreground">
              {produto
                ? "Atualize o produto com mais clareza."
                : "Monte um novo produto com mais contexto."}
            </p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Organize categoria, precos, variacoes e adicionais sem perder a leitura operacional.
        </p>
      </div>
      <div>
        <Label>Categoria</Label>
        <Select
          value={form.menu_category_id}
          onValueChange={(v) => setForm({ ...form, menu_category_id: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Escolha a categoria primeiro" />
          </SelectTrigger>
          <SelectContent>
            {cats.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.menu_category_id && (
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="text-xs">
              <p className="font-semibold text-primary">Modo: {KIND_LABEL[kind]}</p>
              <p className="text-muted-foreground">{KIND_HINT[kind]}</p>
            </div>
          </div>
        )}
      </div>

      <div>
        <Label>Nome</Label>
        <Input
          value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
          placeholder={
            kind === "bebida"
              ? "Ex: Coca-Cola"
              : kind === "lanche"
                ? "Ex: X-Bacon Artesanal"
                : kind === "pizza"
                  ? "Ex: Pizza Calabresa"
                  : "Nome do produto"
          }
        />
      </div>
      <div>
        <Label>Descrição</Label>
        <Textarea
          value={form.descricao.replace(/\s*\[\[extras:[^\]]+\]\]\s*$/, "")}
          onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          placeholder={
            kind === "lanche"
              ? "Ingredientes, molhos, ponto sugerido..."
              : kind === "bebida"
                ? "Sabor, marca, embalagem..."
                : "Descreva o produto"
          }
        />
      </div>

      {extraDefs.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            Detalhes específicos de {KIND_LABEL[kind]}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {extraDefs.map((f) => (
              <div key={f.key}>
                <Label className="text-xs">
                  {f.label}
                  {f.suffix ? ` (${f.suffix})` : ""}
                </Label>
                <Input
                  value={extras[f.key] ?? ""}
                  onChange={(e) => setExtras((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Preço (R$)</Label>
          <Input value={form.preco} onChange={(e) => setForm({ ...form, preco: e.target.value })} />
        </div>
        <div>
          <Label>Preço promo (R$)</Label>
          <Input
            value={form.preco_promo}
            onChange={(e) => setForm({ ...form, preco_promo: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Tempo de preparo (min)</Label>
          <Input value={form.tempo} onChange={(e) => setForm({ ...form, tempo: e.target.value })} />
        </div>
        <div>
          <Label>Estoque</Label>
          <Input
            value={form.estoque}
            onChange={(e) => setForm({ ...form, estoque: e.target.value })}
            placeholder="Ilimitado"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={form.disponivel}
          onCheckedChange={(v) => setForm({ ...form, disponivel: v })}
        />
        <span className="text-sm">Disponível para venda</span>
      </div>
      <div>
        <Label>URL da foto</Label>
        <Input
          value={form.foto_url}
          onChange={(e) => setForm({ ...form, foto_url: e.target.value })}
        />
      </div>

      {variantTpl.length > 0 || variants.filter((v) => !v._deleted).length > 0 ? (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <Label>
                Variações{" "}
                {kind === "bebida" ? "(tamanhos/volumes)" : kind === "pizza" ? "(tamanhos)" : ""}
              </Label>
              <p className="text-xs text-muted-foreground">
                {kind === "bebida"
                  ? "Ex: Lata 350ml, Garrafa 600ml, 1L, 2L — cada um com seu preço"
                  : kind === "pizza"
                    ? "Ex: P, M, G, Família"
                    : kind === "acai"
                      ? "Ex: 300ml, 500ml, 700ml, 1L"
                      : "Diferentes opções do mesmo produto"}
              </p>
            </div>
            <div className="flex gap-2">
              {variantTpl.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={aplicarTemplateVariacoes}
                >
                  <Wand2 className="mr-1 h-3 w-3" /> Sugerir
                </Button>
              )}
              <Button size="sm" variant="outline" type="button" onClick={addVariant}>
                <Plus className="mr-1 h-3 w-3" /> Nova
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {variants.map((v, i) =>
              v._deleted ? null : (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    className="flex-1"
                    placeholder="Nome (ex: 350ml)"
                    value={v.nome}
                    onChange={(e) => updVariant(i, { nome: e.target.value })}
                  />
                  <Input
                    className="w-28"
                    placeholder="Preço R$"
                    value={(v.preco_cents / 100).toFixed(2)}
                    onChange={(e) =>
                      updVariant(i, {
                        preco_cents: Math.round(
                          parseFloat(e.target.value.replace(",", ".") || "0") * 100,
                        ),
                      })
                    }
                  />
                  <Switch checked={v.ativo} onCheckedChange={(a) => updVariant(i, { ativo: a })} />
                  <Button size="icon" variant="ghost" type="button" onClick={() => delVariant(i)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ),
            )}
            {variants.filter((v) => !v._deleted).length === 0 && (
              <p className="text-xs text-muted-foreground">
                Sem variações. Se o produto tem só 1 tamanho/preço, use o Preço acima.
              </p>
            )}
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <Label>Grupos de opcionais/adicionais</Label>
            <p className="text-xs text-muted-foreground">
              {kind === "lanche"
                ? "Bacon, ovo, queijo extra, ponto da carne..."
                : kind === "pizza"
                  ? "Borda, massa, sabores extras..."
                  : kind === "bebida"
                    ? "Gelo, copo, canudo..."
                    : "Marque os grupos que o cliente poderá escolher."}
            </p>
          </div>
          {addonTpl.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={aplicarTemplateComplementos}
              disabled={applyingTpl}
            >
              {applyingTpl ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Wand2 className="mr-1 h-3 w-3" />
              )}
              Aplicar template {KIND_LABEL[kind]}
            </Button>
          )}
        </div>
        {addonGroups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            Nenhum grupo cadastrado.{" "}
            {addonTpl.length > 0
              ? 'Clique em "Aplicar template" acima para criar automaticamente.'
              : "Vá em Complementos e crie o primeiro."}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {addonGroups.map((g) => {
              const on = selectedGroups.has(g.id);
              return (
                <button
                  type="button"
                  key={g.id}
                  onClick={() => toggleGroup(g.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}
                >
                  {on ? "✓ " : ""}
                  {g.nome}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button onClick={salvar} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
        </Button>
      </DialogFooter>
    </div>
  );
}
