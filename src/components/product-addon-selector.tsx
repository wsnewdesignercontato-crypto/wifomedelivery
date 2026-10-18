import { useState } from "react";
import { Check, Layers3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  partitionAddonGroups,
  type CatalogAddonGroup,
  type ProductCategory,
} from "@/lib/catalog-selection";

export function ProductAddonSelector({
  groups,
  categories,
  categoryId,
  selected,
  onToggle,
  disabled,
}: {
  groups: CatalogAddonGroup[];
  categories: ProductCategory[];
  categoryId: string;
  selected: Set<string>;
  onToggle: (id: string) => void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const filtered = groups.filter((group) =>
    group.nome.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")),
  );
  const sections = partitionAddonGroups(filtered, categoryId, selected);
  const categoryName = categories.find((item) => item.id === categoryId)?.nome;
  function options(list: CatalogAddonGroup[]) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((group) => (
          <button
            type="button"
            role="checkbox"
            aria-checked={selected.has(group.id)}
            aria-label={group.nome}
            disabled={disabled || (!group.ativo && !selected.has(group.id))}
            key={group.id}
            onClick={() => onToggle(group.id)}
            className={`flex min-h-16 items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${selected.has(group.id) ? "border-primary/40 bg-primary/5" : "border-border bg-background hover:border-primary/30"}`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${selected.has(group.id) ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}
            >
              {selected.has(group.id) && <Check className="h-3.5 w-3.5" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{group.nome}</span>
              <span className="block text-xs text-muted-foreground">
                {group.obrigatorio ? "Obrigatório" : "Opcional"} ·{" "}
                {group.maximo === 0 ? "Sem limite" : "Até " + group.maximo + " escolha(s)"}
                {!group.ativo && " · Inativo"}
              </span>
            </span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Layers3 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Complementos</h3>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs">
          {selected.size} selecionados
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Selecione os grupos já cadastrados em Complementos.
      </p>
      {groups.length > 5 && (
        <Input
          aria-label="Buscar complemento"
          placeholder="Buscar grupo..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      )}
      {!!sections.recommended.length && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {categoryName ? categoryName + " e uso geral" : "Uso geral"}
          </p>
          {options(sections.recommended)}
        </div>
      )}
      {!!sections.selectedElsewhere.length && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Também selecionados</p>
          {options(sections.selectedElsewhere)}
        </div>
      )}
      {!!sections.other.length && (
        <details className="group">
          <summary className="cursor-pointer py-2 text-xs font-medium text-primary">
            Ver grupos de outras categorias ({sections.other.length})
          </summary>
          <div className="mt-2 space-y-3">
            {[...new Set(sections.other.map((group) => group.menu_category_id))].map((id) => (
              <div key={id} className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {categories.find((category) => category.id === id)?.nome ?? "Outra categoria"}
                </p>
                {options(sections.other.filter((group) => group.menu_category_id === id))}
              </div>
            ))}
          </div>
        </details>
      )}
      {!groups.length && (
        <p className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
          Cadastre seus grupos no módulo Complementos. Eles aparecerão aqui para selecionar.
        </p>
      )}
      {!!groups.length && !filtered.length && (
        <p className="text-sm text-muted-foreground">Nenhum grupo encontrado.</p>
      )}
    </section>
  );
}
