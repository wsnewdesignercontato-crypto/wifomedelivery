import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { AddonTemplate } from "@/lib/category-templates";
export type AddonDraft = {
  key: string;
  nome: string;
  obrigatorio: boolean;
  minimo: number;
  maximo: number;
  itens: { key: string; nome: string; preco: string }[];
};
export function addonDraft(template?: AddonTemplate): AddonDraft {
  return {
    key: crypto.randomUUID(),
    nome: template?.nome ?? "",
    obrigatorio: template?.obrigatorio ?? false,
    minimo: template?.minimo ?? 0,
    maximo: template?.maximo ?? 1,
    itens: (template?.itens ?? [{ nome: "", preco_extra_cents: 0 }]).map((item) => ({
      key: crypto.randomUUID(),
      nome: item.nome,
      preco: (item.preco_extra_cents / 100).toFixed(2),
    })),
  };
}
export function ProductAddonDrafts({
  groups,
  onChange,
}: {
  groups: AddonDraft[];
  onChange: (groups: AddonDraft[]) => void;
}) {
  const update = (key: string, patch: Partial<AddonDraft>) =>
    onChange(groups.map((group) => (group.key === key ? { ...group, ...patch } : group)));
  return (
    <div className="space-y-4">
      {groups.map((group, index) => (
        <fieldset key={group.key} className="space-y-3 rounded-xl border border-border p-3">
          <legend className="px-1 text-sm font-semibold">Novo grupo {index + 1}</legend>
          <div className="flex gap-2">
            <Input
              aria-label={"Nome do grupo " + (index + 1)}
              placeholder="Ex.: Adicionais, borda ou embalagem"
              value={group.nome}
              onChange={(event) => update(group.key, { nome: event.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              aria-label={"Remover grupo " + (index + 1)}
              onClick={() => onChange(groups.filter((item) => item.key !== group.key))}
            >
              Remover
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={group.obrigatorio}
              onCheckedChange={(value) =>
                update(group.key, {
                  obrigatorio: value,
                  minimo: value ? Math.max(group.minimo, 1) : 0,
                })
              }
            />
            Escolha obrigatória
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs">
              Mínimo de escolhas
              <Input
                type="number"
                min="0"
                step="1"
                value={group.minimo}
                onChange={(event) => update(group.key, { minimo: Number(event.target.value) })}
              />
            </label>
            <label className="space-y-1 text-xs">
              Máximo (0 = sem limite)
              <Input
                type="number"
                min="0"
                step="1"
                value={group.maximo}
                onChange={(event) => update(group.key, { maximo: Number(event.target.value) })}
              />
            </label>
          </div>
          {group.itens.map((item, itemIndex) => (
            <div className="flex flex-wrap items-end gap-2" key={item.key}>
              <label className="min-w-[140px] flex-1 space-y-1 text-xs">
                Opção {itemIndex + 1}
                <Input
                  placeholder="Ex.: Bacon, cheddar, sem cebola"
                  value={item.nome}
                  onChange={(event) =>
                    update(group.key, {
                      itens: group.itens.map((other) =>
                        other.key === item.key ? { ...other, nome: event.target.value } : other,
                      ),
                    })
                  }
                />
              </label>
              <label className="w-28 space-y-1 text-xs">
                Preço adicional (R$)
                <Input
                  inputMode="decimal"
                  value={item.preco}
                  onChange={(event) =>
                    update(group.key, {
                      itens: group.itens.map((other) =>
                        other.key === item.key ? { ...other, preco: event.target.value } : other,
                      ),
                    })
                  }
                />
              </label>
              <Button
                type="button"
                variant="ghost"
                aria-label={"Remover opção " + (itemIndex + 1) + " do grupo " + (index + 1)}
                onClick={() =>
                  update(group.key, {
                    itens: group.itens.filter((other) => other.key !== item.key),
                  })
                }
              >
                Remover
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              update(group.key, {
                itens: [...group.itens, { key: crypto.randomUUID(), nome: "", preco: "0.00" }],
              })
            }
          >
            Adicionar opção
          </Button>
        </fieldset>
      ))}
      <Button type="button" variant="outline" onClick={() => onChange([...groups, addonDraft()])}>
        Novo grupo de adicionais
      </Button>
    </div>
  );
}
