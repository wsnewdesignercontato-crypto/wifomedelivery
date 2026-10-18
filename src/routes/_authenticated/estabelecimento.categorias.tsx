import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab } from "@/hooks/use-my-estab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Pencil,
  FolderTree,
  Search,
  Loader2,
} from "lucide-react";
import {
  CATEGORY_CATALOG,
  categoryLabel,
  normalizedCategory,
} from "@/lib/product-category-catalog";

export const Route = createFileRoute("/_authenticated/estabelecimento/categorias")({
  head: () => ({ meta: [{ title: "Loja - Categorias | PedeTrem" }] }),
  component: CategoriasPage,
});
type Cat = { id: string; nome: string; ordem: number };
function CategoriasPage() {
  const { estab } = useMyEstab();
  const estabId = estab?.id;
  const [cats, setCats] = useState<Cat[]>([]),
    [search, setSearch] = useState(""),
    [editing, setEditing] = useState<Cat | null>(null);
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [saving, setSaving] = useState(false),
    [loading, setLoading] = useState(true);
  const [presetSearch, setPresetSearch] = useState("");
  const reload = useCallback(async () => {
    if (!estabId) return;
    const { data, error } = await supabase
      .from("menu_categories")
      .select("id,nome,ordem")
      .eq("establishment_id", estabId)
      .order("ordem");
    if (error) toast.error("Não foi possível carregar as categorias.");
    else setCats(data ?? []);
    setLoading(false);
  }, [estabId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  function show(category: Cat | null) {
    setEditing(category);
    setName(category?.nome ?? "");
    setPresetSearch("");
    setOpen(true);
  }
  async function save() {
    if (!estabId || saving) return;
    const cleaned = name.trim();
    if (cleaned.length < 2 || cleaned.length > 100)
      return toast.error("Use um nome entre 2 e 100 caracteres.");
    if (
      cats.some(
        (category) =>
          category.id !== editing?.id &&
          normalizedCategory(category.nome) === normalizedCategory(cleaned),
      )
    )
      return toast.error("Essa categoria já está cadastrada.");
    setSaving(true);
    try {
      if (editing) {
        const { data, error } = await supabase
          .from("menu_categories")
          .update({ nome: cleaned })
          .eq("id", editing.id)
          .eq("establishment_id", estabId)
          .select("id")
          .single();
        if (error || !data) throw new Error("Não foi possível atualizar a categoria.");
      } else {
        const { data, error } = await supabase.rpc("ensure_menu_category", {
          p_establishment_id: estabId,
          p_name: cleaned,
        });
        if (error || !data) throw new Error("Não foi possível cadastrar a categoria.");
      }
      toast.success(editing ? "Categoria atualizada." : "Categoria cadastrada.");
      setOpen(false);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }
  async function remove(category: Cat) {
    if (!confirm('Excluir a categoria "' + category.nome + '"? Os produtos não serão excluídos.'))
      return;
    const { data, error } = await supabase
      .from("menu_categories")
      .delete()
      .eq("id", category.id)
      .select("id");
    if (error || !data?.length)
      return toast.error("Não foi possível excluir a categoria. Verifique se ela está em uso.");
    toast.success("Categoria excluída.");
    void reload();
  }
  async function move(category: Cat, direction: -1 | 1) {
    const target = cats[cats.findIndex((item) => item.id === category.id) + direction];
    if (!target) return;
    const first = await supabase
      .from("menu_categories")
      .update({ ordem: target.ordem })
      .eq("id", category.id)
      .select("id")
      .single();
    if (first.error || !first.data) return toast.error("Não foi possível alterar a ordem.");
    const second = await supabase
      .from("menu_categories")
      .update({ ordem: category.ordem })
      .eq("id", target.id)
      .select("id")
      .single();
    if (second.error || !second.data) {
      await supabase
        .from("menu_categories")
        .update({ ordem: category.ordem })
        .eq("id", category.id);
      toast.error("Não foi possível alterar a ordem.");
    }
    void reload();
  }
  const filtered = cats.filter((category) =>
    normalizedCategory(category.nome).includes(normalizedCategory(search)),
  );
  const presets = CATEGORY_CATALOG.filter((preset) =>
    normalizedCategory(categoryLabel(preset)).includes(normalizedCategory(presetSearch)),
  );
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categorias</h1>
          <p className="mt-1 text-sm text-muted-foreground">Organize o catálogo da sua loja.</p>
        </div>
        <Button onClick={() => show(null)} className="rounded-xl">
          <Plus className="mr-2 h-4 w-4" />
          Nova categoria
        </Button>
      </div>
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FolderTree className="h-4 w-4 text-primary" />
            Suas categorias
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {cats.length}
            </span>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="Buscar categoria cadastrada"
              placeholder="Buscar categoria..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="rounded-xl pl-9"
            />
          </div>
        </div>
        {loading ? (
          <p role="status" className="p-8 text-center text-sm text-muted-foreground">
            Carregando categorias...
          </p>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((category) => (
              <div key={category.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary">
                  <FolderTree className="h-4 w-4" />
                </div>
                <span className="min-w-0 flex-1 break-words text-sm font-medium">
                  {category.nome}
                </span>
                <div className="flex shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={cats[0]?.id === category.id}
                    aria-label={"Mover " + category.nome + " para cima"}
                    onClick={() => move(category, -1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={cats.at(-1)?.id === category.id}
                    aria-label={"Mover " + category.nome + " para baixo"}
                    onClick={() => move(category, 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={"Editar " + category.nome}
                    onClick={() => show(category)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={"Excluir " + category.nome}
                    onClick={() => remove(category)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            {!filtered.length && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                {cats.length
                  ? "Nenhuma categoria encontrada."
                  : "Nenhuma categoria cadastrada. Use Nova categoria para começar."}
              </p>
            )}
          </div>
        )}
      </section>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!saving) setOpen(value);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar categoria" : "Nova categoria"}</DialogTitle>
            <DialogDescription>Use um nome próprio ou escolha uma sugestão.</DialogDescription>
          </DialogHeader>
          {!editing && (
            <details className="rounded-xl border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Escolher uma sugestão
              </summary>
              <div className="mt-3 space-y-2">
                <Input
                  aria-label="Buscar sugestão de categoria"
                  placeholder="Ex.: refrigerante, farmácia..."
                  value={presetSearch}
                  onChange={(event) => setPresetSearch(event.target.value)}
                />
                <select
                  aria-label="Sugestão de categoria"
                  value=""
                  onChange={(event) => setName(event.target.value)}
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                >
                  <option value="">Selecione uma sugestão</option>
                  {[...new Set(presets.map((item) => item.section))].map((section) => (
                    <optgroup label={section} key={section}>
                      {presets
                        .filter((item) => item.section === section)
                        .map((item) => (
                          <option key={categoryLabel(item)} value={categoryLabel(item)}>
                            {item.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </details>
          )}
          <div className="space-y-2">
            <Label htmlFor="category-name">Nome da categoria</Label>
            <Input
              id="category-name"
              placeholder="Ex.: Pizzas"
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={saving}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving || !name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Salvar categoria" : "Cadastrar categoria"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
