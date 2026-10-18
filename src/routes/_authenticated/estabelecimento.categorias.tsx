import { NicheCategoryPresets, presetExists } from "@/components/niche-category-presets";
import { useNicheCatalog } from "@/hooks/use-niche-catalog";
import { recommendedCategories } from "@/lib/delivery-niches";
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
import { categoryLabel, normalizedCategory } from "@/lib/product-category-catalog";

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
  const { data: niches = [] } = useNicheCatalog();
  const [presetSlug, setPresetSlug] = useState("");
  const [mode, setMode] = useState<"presets" | "custom">("presets");
  const [chosen, setChosen] = useState<string[]>([]);
  function selectNiche(slug: string) {
    setPresetSlug(slug);
    setChosen(
      recommendedCategories(slug)
        .map(categoryLabel)
        .filter((label) => !presetExists(label, cats)),
    );
  }
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
    setMode(category ? "custom" : "presets");
    selectNiche(niches.find((item) => item.id === estab?.categoria_id)?.slug ?? "");
    setOpen(true);
  }
  async function save() {
    if (!estabId || saving) return;
    const cleaned = name.trim();
    if (mode === "custom" && (cleaned.length < 2 || cleaned.length > 100))
      return toast.error("Use um nome entre 2 e 100 caracteres.");
    if (
      mode === "custom" &&
      cats.some(
        (category) =>
          category.id !== editing?.id &&
          normalizedCategory(category.nome) === normalizedCategory(cleaned),
      )
    )
      return toast.error("Essa categoria já está cadastrada.");
    if (!editing && mode === "presets" && !chosen.length)
      return toast.error("Selecione ao menos uma categoria.");
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
        const { data, error } = await supabase.rpc("ensure_menu_categories", {
          p_establishment_id: estabId,
          p_names: mode === "presets" ? chosen : [cleaned],
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
            <DialogDescription>
              {editing
                ? "Ajuste o nome da categoria."
                : "Comece com modelos prontos para seu segmento ou crie uma categoria personalizada."}
            </DialogDescription>
          </DialogHeader>
          {!editing && (
            <div
              role="tablist"
              aria-label="Tipo de categoria"
              className="grid grid-cols-2 rounded-xl bg-muted/40 p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "presets"}
                onClick={() => setMode("presets")}
                className={
                  mode === "presets"
                    ? "rounded-lg bg-background p-2 text-sm font-medium shadow-sm"
                    : "p-2 text-sm text-muted-foreground"
                }
              >
                Modelos prontos
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "custom"}
                onClick={() => setMode("custom")}
                className={
                  mode === "custom"
                    ? "rounded-lg bg-background p-2 text-sm font-medium shadow-sm"
                    : "p-2 text-sm text-muted-foreground"
                }
              >
                Personalizada
              </button>
            </div>
          )}
          {mode === "presets" && !editing ? (
            <NicheCategoryPresets
              niches={niches}
              slug={presetSlug}
              onNicheChange={selectNiche}
              selected={chosen}
              onChange={setChosen}
              existing={cats}
            />
          ) : (
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
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              onClick={save}
              disabled={saving || (mode === "presets" && !editing ? !chosen.length : !name.trim())}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing
                ? "Salvar categoria"
                : mode === "presets"
                  ? "Adicionar " + chosen.length + " categoria(s)"
                  : "Cadastrar categoria"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
