import { ProductSpecificFields } from "@/components/product-specific-fields";
import {
  productFields,
  productSummary,
  readProductDetails,
  writeProductDetails,
} from "@/lib/product-details";
import { Badge } from "@/components/ui/badge";
import { ProductAddonSelector } from "@/components/product-addon-selector";
import type { CatalogAddonGroup } from "@/lib/catalog-selection";
import { productPhotos } from "@/lib/product-photos";
import { ProductPhotoField } from "@/components/product-photo-field";
import { ProductCategoryPicker } from "@/components/product-category-picker";
import { priceInCents } from "@/lib/product-configuration";
import type { Json } from "@/integrations/supabase/types";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab, fmt } from "@/hooks/use-my-estab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
} from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Copy, Pencil, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/estabelecimento/produtos")({
  head: () => ({
    meta: [
      { title: "Loja — Produtos | PedeTrem" },
      { name: "description", content: "PedeTrem: loja, produtos." },
      { property: "og:title", content: "Loja — Produtos | PedeTrem" },
      { property: "og:description", content: "PedeTrem: loja, produtos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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
  fotos_adicionais: string[];
  disponivel: boolean;
  estoque?: number | null;
  menu_category_id?: string | null;
  tempo_preparo_min?: number | null;
};

function ProdutosPage() {
  const { estab } = useMyEstab();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [cats, setCats] = useState<Categoria[]>([]);
  const [addonGroups, setAddonGroups] = useState<CatalogAddonGroup[]>([]);
  const [busca, setBusca] = useState("");
  const [filterCat, setFilterCat] = useState<string>("todas");
  const [editing, setEditing] = useState<Produto | null>(null);
  const [openNew, setOpenNew] = useState(false);

  const estabId = estab?.id;
  const reload = useCallback(async () => {
    if (!estabId) return;
    try {
      const [products, categories, groups] = await Promise.all([
        supabase
          .from("products")
          .select(
            "id,nome,descricao,preco_cents,preco_promo_cents,foto_url,fotos_adicionais,disponivel,estoque,menu_category_id,tempo_preparo_min",
          )
          .eq("establishment_id", estabId)
          .order("created_at", { ascending: false }),
        supabase
          .from("menu_categories")
          .select("id,nome")
          .eq("establishment_id", estabId)
          .order("ordem"),
        supabase
          .from("addon_groups")
          .select("id,nome,menu_category_id,obrigatorio,minimo,maximo,ativo")
          .eq("establishment_id", estabId)
          .order("nome"),
      ]);
      if (products.error || categories.error || groups.error) throw new Error("catalog");
      setProdutos(products.data ?? []);
      setCats(categories.data ?? []);
      setAddonGroups(groups.data ?? []);
    } catch {
      toast.error(
        "Não foi possível atualizar o catálogo. Recarregue a página para tentar novamente.",
      );
    }
  }, [estabId]);
  useEffect(() => {
    void reload();
    const refresh = () => {
      void reload();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [reload]);

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
      fotos_adicionais: p.fotos_adicionais,
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">Produtos</h1>
          <p className="text-sm text-muted-foreground">{produtos.length} produtos cadastrados</p>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Novo produto
            </Button>
          </DialogTrigger>
          <DialogContent className="flex h-[90dvh] max-h-[90dvh] w-[calc(100%_-_1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden border-none p-0 shadow-2xl">
            <DialogHeader className="shrink-0 border-b p-4 pr-12 text-left sm:p-5 sm:pr-12">
              <DialogTitle className="text-xl font-black">Adicionar Novo Produto</DialogTitle>
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ProdutoForm
                cats={cats}
                onRefreshCatalog={reload}
                addonGroups={addonGroups}
                onSaved={() => {
                  setOpenNew(false);
                  reload();
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Buscar produto..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="max-w-xs">
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

      {filtrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nenhum produto encontrado.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtrados.map((p) => (
            <div
              key={p.id}
              className="group relative flex items-start gap-4 rounded-3xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-all hover:border-primary/20"
            >
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-muted shadow-inner">
                {p.foto_url ? (
                  <img
                    src={p.foto_url}
                    alt={p.nome}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <Sparkles className="h-8 w-8 opacity-20" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 py-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-foreground leading-tight group-hover:text-primary transition-colors">
                      {p.nome}
                    </h3>
                    <p className="line-clamp-1 text-[11px] text-muted-foreground mt-0.5">
                      {p.descricao?.replace(/\[\[extras:[^\]]+\]\]/g, "") || "Sem descrição"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-black text-primary">{fmt(p.preco_cents)}</span>
                    {p.preco_promo_cents && (
                      <span className="text-xs font-medium text-emerald-500 line-through opacity-70">
                        {fmt(p.preco_promo_cents)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {!p.disponivel && (
                      <Badge
                        variant="secondary"
                        className="bg-muted text-[10px] h-5 px-1.5 uppercase font-bold"
                      >
                        Pausado
                      </Badge>
                    )}
                    {p.estoque !== null && p.estoque !== undefined && p.estoque <= 5 && (
                      <Badge variant="destructive" className="text-[10px] h-5 px-1.5 font-bold">
                        Baixo Estoque
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="absolute right-3 top-3 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8 rounded-full shadow-lg"
                  onClick={() => setEditing(p)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8 rounded-full shadow-lg"
                  onClick={() => duplicar(p)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="flex h-[90dvh] max-h-[90dvh] w-[calc(100%_-_1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden border-none p-0 shadow-2xl">
          <DialogHeader className="shrink-0 border-b p-4 pr-12 text-left sm:p-5 sm:pr-12">
            <DialogTitle className="text-xl font-black">Editar Produto</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {editing && (
              <ProdutoForm
                cats={cats}
                onRefreshCatalog={reload}
                addonGroups={addonGroups}
                produto={editing}
                onSaved={() => {
                  setEditing(null);
                  reload();
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
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
  onRefreshCatalog,
  addonGroups,
  produto,
  onSaved,
}: {
  cats: Categoria[];
  onRefreshCatalog: () => Promise<void>;
  addonGroups: CatalogAddonGroup[];
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
  const [extras, setExtras] = useState<Record<string, string>>(
    () => readProductDetails(produto?.descricao).attributes,
  );
  const [showAddons, setShowAddons] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [variants, setVariants] = useState<Variant[]>([]);
  const [saving, setSaving] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<(File | null)[]>([null, null, null]);
  const [photoUrls, setPhotoUrls] = useState<string[]>(
    [produto?.foto_url ?? "", ...(produto?.fotos_adicionais ?? []), "", ""].slice(0, 3),
  );
  const [busyPhotos, setBusyPhotos] = useState<boolean[]>([false, false, false]);
  const photoBusy = busyPhotos.some(Boolean);
  const [configLoading, setConfigLoading] = useState(!!produto);
  const [configError, setConfigError] = useState(false);
  const [refreshingCategories, setRefreshingCategories] = useState(false);

  const catNome = cats.find((c) => c.id === form.menu_category_id)?.nome;
  const fields = productFields(catNome);

  useEffect(() => {
    if (!produto?.id) return;
    let cancelled = false;
    setConfigLoading(true);
    void (async () => {
      try {
        const [groups, options] = await Promise.all([
          supabase
            .from("product_addon_groups")
            .select("addon_group_id")
            .eq("product_id", produto.id),
          supabase
            .from("product_variants")
            .select("id,nome,preco_cents,ativo,ordem")
            .eq("product_id", produto.id)
            .order("ordem"),
        ]);
        if (groups.error || options.error) throw groups.error ?? options.error;
        if (cancelled) return;
        setSelectedGroups(new Set((groups.data ?? []).map((item) => item.addon_group_id)));
        setVariants(((options.data ?? []) as Variant[]).map((item) => ({ ...item, _new: false })));
        setConfigError(false);
      } catch {
        if (!cancelled) {
          setConfigError(true);
          toast.error(
            "Não foi possível carregar adicionais e variações. Feche e abra o produto para tentar novamente.",
          );
        }
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [produto?.id, produto?.descricao]);

  function toggleGroup(id: string) {
    setSelectedGroups((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
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
    if (!estab || saving || photoBusy || configLoading || configError) return;
    if (!cats.length) {
      document.getElementById("product-category")?.focus();
      return toast.error(
        "Cadastre uma categoria no módulo Categorias e atualize a lista para salvar.",
      );
    }
    if (!form.nome.trim()) {
      document.getElementById("product-name")?.focus();
      return toast.error("Informe o nome do produto.");
    }
    if (!form.menu_category_id) {
      document.getElementById("product-category")?.focus();
      return toast.error("Escolha uma categoria para o produto.");
    }
    setSaving(true);
    let uploadedPhotos: string[] = [];
    try {
      const price = priceInCents(form.preco);
      const promo = form.preco_promo.trim() ? priceInCents(form.preco_promo) : null;
      if (promo !== null && promo > price)
        throw new Error("O preço promocional não pode superar o preço base.");
      const stock = form.estoque.trim() ? Number(form.estoque) : null;
      const time = form.tempo.trim() ? Number(form.tempo) : null;
      if (
        (stock !== null && (!Number.isInteger(stock) || stock < 0)) ||
        (time !== null && (!Number.isInteger(time) || time < 0))
      )
        throw new Error("Estoque e tempo de preparo devem ser números inteiros positivos ou zero.");
      const description = writeProductDetails(form.descricao, extras, fields);
      const urls = [...photoUrls];
      for (let index = 0; index < 3; index++) {
        const file = photoFiles[index];
        if (!file) continue;
        const path = `${estab.id}/${crypto.randomUUID()}.jpg`;
        const upload = await supabase.storage
          .from("product-photos")
          .upload(path, file, { contentType: "image/jpeg", upsert: false });
        if (upload.error)
          throw new Error("Não foi possível enviar a foto " + (index + 1) + ". Tente novamente.");
        uploadedPhotos.push(path);
        urls[index] = supabase.storage.from("product-photos").getPublicUrl(path).data.publicUrl;
      }
      const photos = productPhotos(urls[0], urls.slice(1));
      const payload = {
        establishment_id: estab.id,
        nome: form.nome.trim(),
        descricao: description || null,
        preco_cents: price,
        preco_promo_cents: promo,
        foto_url: photos[0] || null,
        fotos_adicionais: photos.slice(1),
        menu_category_id: form.menu_category_id,
        estoque: stock,
        tempo_preparo_min: time,
        disponivel: form.disponivel,
      };
      const { data, error } = await supabase.rpc("save_product_configuration", {
        p_product_id: produto?.id ?? null,
        p_product: payload,
        p_group_ids: [...selectedGroups],
        p_new_groups: [],
        p_variant_changes: variants as unknown as Json,
      });
      if (error || !data) throw new Error(error?.message ?? "O banco não confirmou o salvamento.");
      uploadedPhotos = [];
      toast.success("Produto, fotos, categoria e adicionais salvos.");
      onSaved();
    } catch (error) {
      if (uploadedPhotos.length) {
        try {
          await supabase.storage.from("product-photos").remove(uploadedPhotos);
        } catch {
          /* Preserve the original save error. */
        }
      }
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o produto.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6"
        aria-label="Campos do produto"
        role="region"
      >
        <section className="space-y-3 rounded-2xl border border-border bg-gradient-to-br from-muted/30 to-background p-4">
          <div>
            <h3 className="text-sm font-semibold">Fotos do produto</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Até 3 fotos · 1.000 × 1.000 px · JPG, PNG ou WebP · até 5 MB cada
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[0, 1, 2].map((index) => (
              <ProductPhotoField
                key={index}
                compact
                title={index === 0 ? "Principal" : `Foto ${index + 1}`}
                optional={index !== 0}
                url={photoUrls[index]}
                file={photoFiles[index]}
                disabled={saving}
                onBusy={(busy) =>
                  setBusyPhotos((previous) =>
                    previous.map((value, i) => (i === index ? busy : value)),
                  )
                }
                onChange={(file, remove) => {
                  setPhotoFiles((previous) =>
                    previous.map((value, i) => (i === index ? file : value)),
                  );
                  if (remove)
                    setPhotoUrls((previous) =>
                      previous.map((value, i) => (i === index ? "" : value)),
                    );
                }}
              />
            ))}
          </div>
        </section>
        <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">Informações do produto</h3>
          <div className="space-y-1.5">
            <Label htmlFor="product-name">Nome do produto</Label>
            <Input
              id="product-name"
              placeholder="Ex.: X-Salada artesanal"
              value={form.nome}
              maxLength={200}
              onChange={(event) => setForm({ ...form, nome: event.target.value })}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-category">Categoria</Label>
            <ProductCategoryPicker
              categories={cats}
              value={form.menu_category_id}
              onChange={(id) => setForm({ ...form, menu_category_id: id })}
              disabled={saving}
            />
            {!cats.length && (
              <div
                className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
                role="note"
              >
                <p>
                  Crie ou escolha um modelo no módulo Categorias. Depois, atualize esta lista para
                  continuar com os dados que já preencheu.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    className="font-semibold underline underline-offset-2"
                    href="/estabelecimento/categorias"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir Categorias
                  </a>
                  <button
                    type="button"
                    className="font-semibold underline underline-offset-2 disabled:opacity-50"
                    disabled={refreshingCategories || saving}
                    onClick={async () => {
                      setRefreshingCategories(true);
                      try {
                        await onRefreshCatalog();
                      } finally {
                        setRefreshingCategories(false);
                      }
                    }}
                  >
                    {refreshingCategories ? "Atualizando..." : "Atualizar lista"}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="product-price">Preço (R$)</Label>
              <Input
                id="product-price"
                inputMode="decimal"
                placeholder="0,00"
                value={form.preco}
                onChange={(event) => setForm({ ...form, preco: event.target.value })}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-promo">Promoção (R$)</Label>
              <Input
                id="product-promo"
                inputMode="decimal"
                placeholder="Opcional"
                value={form.preco_promo}
                onChange={(event) => setForm({ ...form, preco_promo: event.target.value })}
                disabled={saving}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-description">
              Descrição <span className="font-normal text-muted-foreground">· opcional</span>
            </Label>
            <Textarea
              id="product-description"
              value={readProductDetails(form.descricao).description}
              onChange={(event) => setForm({ ...form, descricao: event.target.value })}
              placeholder="Ingredientes ou detalhes do produto"
              className="min-h-20 resize-y"
              disabled={saving}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2.5">
            <Label htmlFor="product-active" className="text-sm font-medium">
              Disponível para venda
            </Label>
            <Switch
              id="product-active"
              checked={form.disponivel}
              onCheckedChange={(value) => setForm({ ...form, disponivel: value })}
              disabled={saving}
            />
          </div>
        </section>
        <ProductSpecificFields
          fields={fields}
          values={extras}
          onChange={setExtras}
          disabled={saving}
        />
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <Label htmlFor="offer-addons">Oferecer complementos</Label>
          <Switch
            id="offer-addons"
            checked={showAddons || selectedGroups.size > 0}
            disabled={saving || configLoading}
            onCheckedChange={(value) => {
              setShowAddons(value);
              if (!value) setSelectedGroups(new Set());
            }}
          />
        </div>
        {(showAddons || selectedGroups.size > 0) && (
          <ProductAddonSelector
            groups={addonGroups}
            categories={cats}
            categoryId={form.menu_category_id}
            selected={selectedGroups}
            onToggle={toggleGroup}
            disabled={saving || configLoading || configError}
          />
        )}
        <details className="rounded-2xl border border-border bg-card px-4">
          <summary className="cursor-pointer py-4 text-sm font-medium">
            Mais opções{" "}
            <span className="ml-1 font-normal text-muted-foreground">
              · estoque, preparo e variações
            </span>
          </summary>
          <div className="space-y-4 pb-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="product-stock">Estoque</Label>
                <Input
                  id="product-stock"
                  type="number"
                  min="0"
                  placeholder="Sem limite"
                  value={form.estoque}
                  onChange={(event) => setForm({ ...form, estoque: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="product-time">Preparo (min)</Label>
                <Input
                  id="product-time"
                  type="number"
                  min="0"
                  placeholder="Opcional"
                  value={form.tempo}
                  onChange={(event) => setForm({ ...form, tempo: event.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">
                Variações ({variants.filter((item) => !item._deleted).length})
              </h4>
              <Button type="button" variant="ghost" size="sm" onClick={addVariant}>
                Adicionar variação
              </Button>
            </div>
            {variants.map(
              (variant, index) =>
                !variant._deleted && (
                  <div
                    key={variant.id ?? index}
                    className="grid grid-cols-[1fr_6rem_auto] items-center gap-2"
                  >
                    <Input
                      aria-label={"Nome da variação " + (index + 1)}
                      placeholder="Ex.: Grande"
                      value={variant.nome}
                      onChange={(event) => updVariant(index, { nome: event.target.value })}
                    />
                    <Input
                      aria-label={"Preço da variação " + (index + 1)}
                      type="number"
                      step="0.01"
                      min="0"
                      value={(variant.preco_cents / 100).toFixed(2)}
                      onChange={(event) =>
                        updVariant(index, {
                          preco_cents: Math.round(Number(event.target.value) * 100),
                        })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={"Remover variação " + (index + 1)}
                      onClick={() => delVariant(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ),
            )}
          </div>
        </details>
        {configLoading && (
          <p role="status" className="text-xs text-muted-foreground">
            Carregando opções do produto...
          </p>
        )}
        {configError && (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar as opções. Reabra o produto antes de salvar.
          </p>
        )}
      </div>
      <div className="shrink-0 space-y-2 border-t border-border bg-background p-4 sm:px-6">
        {(!cats.length || photoBusy || configLoading || configError) && (
          <p role="status" className="text-xs text-muted-foreground">
            {configError
              ? "Reabra o produto para carregar as opções antes de salvar."
              : configLoading
                ? "Carregando as opções do produto..."
                : photoBusy
                  ? "Preparando as fotos. Aguarde um instante..."
                  : "Cadastre uma categoria em Categorias para salvar o produto."}
          </p>
        )}
        <Button
          onClick={salvar}
          disabled={saving || photoBusy || configLoading || configError}
          className="h-11 w-full rounded-xl font-semibold"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            "Salvar produto"
          )}
        </Button>
      </div>
    </div>
  );
}
