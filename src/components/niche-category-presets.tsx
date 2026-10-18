import { useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { GlobalNiche } from "@/hooks/use-niche-catalog";
import { nicheCategories } from "@/lib/delivery-niches";
import { categoryLabel, normalizedCategory } from "@/lib/product-category-catalog";
export function presetExists(label: string, existing: { nome: string }[]) {
  const full = normalizedCategory(label),
    leaf = full.split(" / ").at(-1) ?? full;
  return existing.some((item) => {
    const name = normalizedCategory(item.nome);
    return name === full || name.replace(/s$/, "") === leaf.replace(/s$/, "");
  });
}
export function NicheCategoryPresets({
  niches,
  slug,
  onNicheChange,
  selected,
  onChange,
  existing,
}: {
  niches: GlobalNiche[];
  slug: string;
  onNicheChange: (slug: string) => void;
  selected: string[];
  onChange: (names: string[]) => void;
  existing: { nome: string }[];
}) {
  const [search, setSearch] = useState("");
  const presets = nicheCategories(slug).filter((item) =>
    normalizedCategory(categoryLabel(item)).includes(normalizedCategory(search)),
  );
  return (
    <div className="space-y-3">
      <select
        aria-label="Segmento dos modelos de categoria"
        value={slug}
        onChange={(event) => {
          setSearch("");
          onNicheChange(event.target.value);
        }}
        className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
      >
        <option value="">Todos os segmentos</option>
        {niches.map((item) => (
          <option key={item.id} value={item.slug}>
            {item.nome}
          </option>
        ))}
      </select>
      <Input
        aria-label="Buscar categoria pronta"
        placeholder="Buscar categoria pronta..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="max-h-60 space-y-1.5 overflow-y-auto rounded-xl border border-border p-2">
        {presets.map((preset) => {
          const label = categoryLabel(preset),
            exists = presetExists(label, existing),
            checked = selected.includes(label);
          return (
            <button
              type="button"
              role="checkbox"
              aria-checked={checked || exists}
              aria-label={label}
              key={label}
              disabled={exists}
              onClick={() =>
                onChange(checked ? selected.filter((item) => item !== label) : [...selected, label])
              }
              className={`flex w-full items-center gap-3 rounded-lg p-2.5 text-left text-sm disabled:opacity-50 ${checked ? "bg-primary/5" : "hover:bg-muted/40"}`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked || exists ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}
              >
                {(checked || exists) && <Check className="h-3 w-3" />}
              </span>
              <span className="min-w-0 flex-1">
                {preset.name}
                <span className="block text-[11px] text-muted-foreground">
                  {exists ? "Já cadastrada" : preset.section}
                </span>
              </span>
            </button>
          );
        })}
        {!presets.length && (
          <p className="p-3 text-sm text-muted-foreground">Nenhuma sugestão encontrada.</p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {selected.length} selecionada(s). Você pode ajustar os nomes depois.
      </p>
    </div>
  );
}
