import { useId, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  CATEGORY_CATALOG,
  categoryLabel,
  normalizedCategory,
} from "@/lib/product-category-catalog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export type ProductCategory = { id: string; nome: string };
export function ProductCategoryPicker({
  establishmentId,
  categories,
  value,
  onChange,
  onCreated,
}: {
  establishmentId: string;
  categories: ProductCategory[];
  value: string;
  onChange: (id: string) => void;
  onCreated: (category: ProductCategory) => void;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const searchTerm = normalizedCategory(search);
  const presets = CATEGORY_CATALOG.filter((preset) =>
    normalizedCategory(categoryLabel(preset)).includes(searchTerm),
  );
  const sections = [...new Set(presets.map((preset) => preset.section))];
  async function create(name: string) {
    if (busy) return;
    const cleaned = name.trim();
    if (cleaned.length < 2 || cleaned.length > 100)
      return toast.error("Use um nome de categoria entre 2 e 100 caracteres.");
    const existing = categories.find(
      (category) => normalizedCategory(category.nome) === normalizedCategory(cleaned),
    );
    if (existing) {
      onChange(existing.id);
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("ensure_menu_category", {
        p_establishment_id: establishmentId,
        p_name: cleaned,
      });
      if (error || !data || typeof data !== "object" || Array.isArray(data))
        throw new Error("Não foi possível cadastrar a categoria.");
      const category = data as unknown as ProductCategory;
      if (!category.id || !category.nome) throw new Error("A categoria não foi confirmada.");
      onCreated(category);
      onChange(category.id);
      setCustom("");
      setSearch("");
      toast.success("Categoria cadastrada e selecionada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a categoria.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <Input
        aria-label="Buscar categoria"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar: pizza, refrigerante, farmácia..."
        disabled={busy}
      />
      <select
        id={id}
        aria-label="Categoria do produto"
        className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
        value={value}
        disabled={busy}
        onChange={(event) => {
          const selected = event.target.value;
          if (selected.startsWith("catalog:")) void create(selected.slice(8));
          else onChange(selected);
        }}
      >
        <option value="">Escolha a categoria</option>
        {categories.length > 0 && (
          <optgroup label="Categorias da sua loja">
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.nome}
              </option>
            ))}
          </optgroup>
        )}
        {sections.map((section) => (
          <optgroup key={section} label={section}>
            {presets
              .filter((preset) => preset.section === section)
              .filter(
                (preset) =>
                  !categories.some(
                    (category) =>
                      normalizedCategory(category.nome) ===
                      normalizedCategory(categoryLabel(preset)),
                  ),
              )
              .map((preset) => (
                <option key={categoryLabel(preset)} value={"catalog:" + categoryLabel(preset)}>
                  {preset.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">
        {busy
          ? "Salvando categoria..."
          : "Escolha uma sugestão para adicioná-la ao catálogo da sua loja."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          className="min-w-0 flex-1"
          aria-label="Nome da nova categoria"
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          placeholder="Ou crie sua própria categoria"
          maxLength={100}
          disabled={busy}
        />
        <Button
          type="button"
          variant="outline"
          disabled={busy || custom.trim().length < 2}
          onClick={() => void create(custom)}
        >
          Criar categoria
        </Button>
      </div>
    </div>
  );
}
