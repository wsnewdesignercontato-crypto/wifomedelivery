import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Loader2, Plus, Trash2, Copy, Pencil, Sparkles, Wand2 } from "lucide-react";
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
          <DialogContent className="max-w-2xl sm:max-h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl">
            <DialogHeader className="p-6 pb-0">
              <DialogTitle className="text-xl font-black">Adicionar Novo Produto</DialogTitle>
            </DialogHeader>
            <div className="p-6 pt-4 overflow-y-auto">
              <ProdutoForm
                cats={cats}
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
                  <img src={p.foto_url} alt={p.nome} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <Sparkles className="h-8 w-8 opacity-20" />
                  </div>
                )}
              </div>
              
              <div className="min-w-0 flex-1 py-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-foreground leading-tight group-hover:text-primary transition-colors">{p.nome}</h3>
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
                    {!p.disponivel && <Badge variant="secondary" className="bg-muted text-[10px] h-5 px-1.5 uppercase font-bold">Pausado</Badge>}
                    {p.estoque !== null && p.estoque <= 5 && <Badge variant="destructive" className="text-[10px] h-5 px-1.5 font-bold">Baixo Estoque</Badge>}
                  </div>
                </div>
              </div>

              <div className="absolute right-3 top-3 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full shadow-lg" onClick={() => setEditing(p)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full shadow-lg" onClick={() => duplicar(p)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl sm:max-h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="text-xl font-black">Editar Produto</DialogTitle>
          </DialogHeader>
          <div className="p-6 pt-4 overflow-y-auto">
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
    const m = /\[\[extras:([^\]]+)\]\]/.exec(produto.descricao ?? "");
    if (m) {
      const obj: Record<string, string> = {};
      m[1].split(";").forEach((p) => {
        const [k, ...rest] = p.split("=");
        if (k && rest.length) obj[k.trim()] = rest.join("=").trim();
      });
      setExtras(obj);
    }
  }, [produto?.id]);

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
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Categoria</Label>
          <Select
            value={form.menu_category_id}
            onValueChange={(v) => setForm({ ...form, menu_category_id: v })}
          >
            <SelectTrigger className="h-11 rounded-xl border-border bg-muted/30 focus:ring-primary/20">
              <SelectValue placeholder="Escolha a categoria" />
            </SelectTrigger>
            <SelectContent>
              {cats.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</Label>
          <div className="flex h-11 items-center justify-between rounded-xl border border-border bg-muted/30 px-4">
            <span className="text-sm font-medium">{form.disponivel ? "Disponível para venda" : "Indisponível"}</span>
            <Switch checked={form.disponivel} onCheckedChange={(v) => setForm({ ...form, disponivel: v })} />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Nome do Produto</Label>
        <Input
          value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
          placeholder="Ex: X-Salada Artesanal"
          className="h-11 rounded-xl border-border bg-muted/30 focus:ring-primary/20"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Preço Base</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">R$</span>
            <Input
              type="number"
              step="0.01"
              value={form.preco}
              onChange={(e) => setForm({ ...form, preco: e.target.value })}
              className="h-11 rounded-xl border-border bg-muted/30 pl-9 focus:ring-primary/20"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Preço Promo</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-500/70">R$</span>
            <Input
              type="number"
              step="0.01"
              value={form.preco_promo}
              onChange={(e) => setForm({ ...form, preco_promo: e.target.value })}
              className="h-11 rounded-xl border-border bg-muted/30 pl-9 text-emerald-600 focus:ring-emerald-500/20"
              placeholder="Opcional"
            />
          </div>
        </div>

        <div className="col-span-2 md:col-span-1 space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Estoque</Label>
          <Input
            type="number"
            value={form.estoque}
            onChange={(e) => setForm({ ...form, estoque: e.target.value })}
            placeholder="∞ Ilimitado"
            className="h-11 rounded-xl border-border bg-muted/30 focus:ring-primary/20"
          />
        </div>
      </div>

      {kind !== "outro" && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Configuração Inteligente: {KIND_LABEL[kind]}</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{KIND_HINT[kind]}</p>
          
          <div className="flex flex-wrap gap-2 pt-1">
            {addonTpl.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg border-primary/30 text-[11px] hover:bg-primary hover:text-white"
                onClick={aplicarTemplateComplementos}
                disabled={applyingTpl}
              >
                {applyingTpl ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Wand2 className="mr-1 h-3 w-3" />}
                Importar Complementos
              </Button>
            )}
            {variantTpl.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg border-primary/30 text-[11px] hover:bg-primary hover:text-white"
                onClick={aplicarTemplateVariacoes}
              >
                <Plus className="mr-1 h-3 w-3" /> Adicionar Variações
              </Button>
            )}
          </div>
        </div>
      )}

      {extraDefs.length > 0 && (
        <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-muted/10 p-4">
          {extraDefs.map((ed) => (
            <div key={ed.key} className="space-y-2">
              <Label className="text-[11px] font-bold uppercase text-muted-foreground">{ed.label}</Label>
              <div className="relative">
                <Input
                  value={extras[ed.key] ?? ""}
                  onChange={(e) => setExtras({ ...extras, [ed.key]: e.target.value })}
                  placeholder={ed.placeholder}
                  className="h-9 rounded-lg border-border bg-background text-sm"
                />
                {ed.suffix && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">
                    {ed.suffix}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Descrição</Label>
        <Textarea
          value={form.descricao.replace(/\s*\[\[extras:[^\]]+\]\]\s*$/, "")}
          onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          placeholder="Ingredientes e detalhes..."
          className="min-h-[80px] rounded-xl border-border bg-muted/30 focus:ring-primary/20 resize-none"
        />
      </div>

      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
            Variações <Badge variant="outline" className="text-[10px]">{variants.filter(v => !v._deleted).length}</Badge>
          </h3>
          <Button type="button" variant="ghost" size="sm" onClick={addVariant} className="h-8 text-xs text-primary">
            <Plus className="mr-1 h-3 w-3" /> Nova variação
          </Button>
        </div>
        
        <div className="space-y-2">
          {variants.filter((v) => !v._deleted).map((v, i) => {
            const actualIdx = variants.indexOf(v);
            return (
              <div key={i} className="flex items-center gap-2 rounded-xl border border-border p-2 bg-muted/20">
                <Input
                  value={v.nome}
                  onChange={(e) => updVariant(actualIdx, { nome: e.target.value })}
                  placeholder="Ex: Grande"
                  className="h-9 flex-1 bg-background text-sm border-none shadow-none focus-visible:ring-0"
                />
                <div className="relative w-24">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">R$</span>
                  <Input
                    type="number"
                    value={(v.preco_cents / 100).toFixed(2)}
                    onChange={(e) => updVariant(actualIdx, { preco_cents: Math.round(parseFloat(e.target.value) * 100) })}
                    className="h-9 pl-7 bg-background text-sm border-none shadow-none focus-visible:ring-0"
                  />
                </div>
                <Button size="icon" variant="ghost" onClick={() => delVariant(actualIdx)} className="h-8 w-8 text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-4 pt-2">
        <h3 className="text-sm font-bold flex items-center gap-2 border-b border-border pb-2 text-foreground">
          Complementos <Badge variant="outline" className="text-[10px]">{selectedGroups.size}</Badge>
        </h3>
        <div className="grid grid-cols-2 gap-2 max-h-[150px] overflow-y-auto pr-1 custom-scrollbar">
          {addonGroups.map((g) => (
            <div
              key={g.id}
              onClick={() => toggleGroup(g.id)}
              className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-all ${
                selectedGroups.has(g.id)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-muted/20 hover:border-primary/50"
              }`}
            >
              <span className="text-xs font-medium truncate">{g.nome}</span>
              {selectedGroups.has(g.id) && <Sparkles className="h-3 w-3 fill-primary" />}
            </div>
          ))}
        </div>
      </div>

      <Button onClick={salvar} disabled={saving} className="w-full h-12 rounded-xl text-base font-bold shadow-lg shadow-primary/20">
        {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Salvar Alterações"}
      </Button>
    </div>
  );
}
