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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Copy, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/estabelecimento/produtos")({
  component: ProdutosPage,
});

type Categoria = { id: string; nome: string };
type Produto = {
  id: string; nome: string; descricao: string | null;
  preco_cents: number; preco_promo_cents?: number | null;
  foto_url: string | null; disponivel: boolean; estoque?: number | null;
  categoria_id?: string | null; tempo_preparo_min?: number | null;
};

function ProdutosPage() {
  const { estab } = useMyEstab();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [cats, setCats] = useState<Categoria[]>([]);
  const [busca, setBusca] = useState("");
  const [filterCat, setFilterCat] = useState<string>("todas");
  const [editing, setEditing] = useState<Produto | null>(null);
  const [openNew, setOpenNew] = useState(false);

  async function reload() {
    if (!estab) return;
    const { data } = await supabase.from("products")
      .select("id,nome,descricao,preco_cents,preco_promo_cents,foto_url,disponivel,estoque,categoria_id,tempo_preparo_min")
      .eq("establishment_id", estab.id).order("created_at", { ascending: false });
    setProdutos((data ?? []) as Produto[]);
    const { data: c } = await supabase.from("menu_categories")
      .select("id,nome").eq("establishment_id", estab.id).order("ordem");
    setCats((c ?? []) as Categoria[]);
  }
  useEffect(() => { reload(); }, [estab?.id]);

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
      nome: p.nome + " (cópia)", descricao: p.descricao, preco_cents: p.preco_cents,
      preco_promo_cents: p.preco_promo_cents, foto_url: p.foto_url,
      disponivel: false, categoria_id: p.categoria_id, estoque: p.estoque,
      tempo_preparo_min: p.tempo_preparo_min,
    });
    if (error) toast.error("Falha ao duplicar"); else { toast.success("Duplicado"); reload(); }
  }

  const filtrados = produtos.filter((p) =>
    (filterCat === "todas" || p.categoria_id === filterCat) &&
    (!busca || p.nome.toLowerCase().includes(busca.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Produtos</h1>
          <p className="text-sm text-muted-foreground">{produtos.length} produtos cadastrados</p>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Novo produto</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Novo produto</DialogTitle></DialogHeader>
            <ProdutoForm cats={cats} onSaved={() => { setOpenNew(false); reload(); }} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Buscar produto..." value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-xs" />
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {cats.map((c) => (<SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {filtrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nenhum produto encontrado.
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {filtrados.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-card">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                {p.foto_url && <img src={p.foto_url} alt={p.nome} className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold">{p.nome}</p>
                  {!p.disponivel && <Badge variant="secondary" className="text-xs">Off</Badge>}
                  {p.estoque !== null && p.estoque !== undefined && p.estoque <= 5 && (
                    <Badge variant="destructive" className="text-xs">Estoque {p.estoque}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-primary">{fmt(p.preco_cents)}</span>
                  {p.preco_promo_cents && (
                    <span className="text-xs text-emerald-500">{fmt(p.preco_promo_cents)}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Switch checked={p.disponivel} onCheckedChange={() => toggle(p)} />
                <Button size="icon" variant="ghost" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => duplicar(p)}><Copy className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => remover(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Editar produto</DialogTitle></DialogHeader>
          {editing && (
            <ProdutoForm cats={cats} produto={editing} onSaved={() => { setEditing(null); reload(); }} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProdutoForm({ cats, produto, onSaved }: { cats: Categoria[]; produto?: Produto; onSaved: () => void }) {
  const { estab } = useMyEstab();
  const [form, setForm] = useState({
    nome: produto?.nome ?? "",
    descricao: produto?.descricao ?? "",
    preco: produto ? (produto.preco_cents / 100).toFixed(2) : "",
    preco_promo: produto?.preco_promo_cents ? (produto.preco_promo_cents / 100).toFixed(2) : "",
    foto_url: produto?.foto_url ?? "",
    categoria_id: produto?.categoria_id ?? "",
    estoque: produto?.estoque?.toString() ?? "",
    tempo: produto?.tempo_preparo_min?.toString() ?? "",
    disponivel: produto?.disponivel ?? true,
  });
  const [saving, setSaving] = useState(false);

  async function salvar() {
    if (!estab || !form.nome.trim() || !form.preco) return toast.error("Nome e preço obrigatórios");
    setSaving(true);
    const payload = {
      establishment_id: estab.id,
      nome: form.nome.trim(),
      descricao: form.descricao || null,
      preco_cents: Math.round(parseFloat(form.preco) * 100),
      preco_promo_cents: form.preco_promo ? Math.round(parseFloat(form.preco_promo) * 100) : null,
      foto_url: form.foto_url || null,
      categoria_id: form.categoria_id || null,
      estoque: form.estoque ? parseInt(form.estoque) : null,
      tempo_preparo_min: form.tempo ? parseInt(form.tempo) : null,
      disponivel: form.disponivel,
    };
    const { error } = produto
      ? await supabase.from("products").update(payload).eq("id", produto.id)
      : await supabase.from("products").insert(payload);
    setSaving(false);
    if (error) return toast.error("Falha ao salvar");
    toast.success("Produto salvo");
    onSaved();
  }

  return (
    <div className="grid gap-3">
      <div><Label>Nome</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
      <div><Label>Descrição</Label><Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Preço (R$)</Label><Input value={form.preco} onChange={(e) => setForm({ ...form, preco: e.target.value })} /></div>
        <div><Label>Preço promo (R$)</Label><Input value={form.preco_promo} onChange={(e) => setForm({ ...form, preco_promo: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Categoria</Label>
          <Select value={form.categoria_id} onValueChange={(v) => setForm({ ...form, categoria_id: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {cats.map((c) => (<SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Tempo de preparo (min)</Label><Input value={form.tempo} onChange={(e) => setForm({ ...form, tempo: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Estoque</Label><Input value={form.estoque} onChange={(e) => setForm({ ...form, estoque: e.target.value })} placeholder="Deixe em branco = ilimitado" /></div>
        <div className="flex items-end gap-2">
          <Switch checked={form.disponivel} onCheckedChange={(v) => setForm({ ...form, disponivel: v })} />
          <span className="text-sm">Disponível</span>
        </div>
      </div>
      <div><Label>URL da foto</Label><Input value={form.foto_url} onChange={(e) => setForm({ ...form, foto_url: e.target.value })} /></div>
      <DialogFooter>
        <Button onClick={salvar} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
        </Button>
      </DialogFooter>
    </div>
  );
}
