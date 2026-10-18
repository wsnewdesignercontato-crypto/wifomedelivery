import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab, fmt } from "@/hooks/use-my-estab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Layers3, Loader2 } from "lucide-react";
import { addonDraft, type AddonDraft } from "@/components/product-addon-drafts";
import { validateAddonDrafts } from "@/lib/product-configuration";
import {
  getCategoryKind,
  ADDON_TEMPLATES,
  KIND_LABEL,
  type CategoryKind,
} from "@/lib/category-templates";
import type { CatalogAddonGroup, ProductCategory } from "@/lib/catalog-selection";
export const Route = createFileRoute("/_authenticated/estabelecimento/complementos")({
  head: () => ({ meta: [{ title: "Loja - Complementos | PedeTrem" }] }),
  component: ComplementosPage,
});
type Addon = {
  id: string;
  addon_group_id: string;
  nome: string;
  preco_extra_cents: number;
  ativo: boolean;
};
function ComplementosPage() {
  const { estab } = useMyEstab();
  const shopId = estab?.id;
  const [groups, setGroups] = useState<CatalogAddonGroup[]>([]),
    [addons, setAddons] = useState<Addon[]>([]),
    [categories, setCategories] = useState<ProductCategory[]>([]);
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<CatalogAddonGroup | null>(null);
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(false);
  const reload = useCallback(async () => {
    if (!shopId) return;
    try {
      const [g, c] = await Promise.all([
        supabase
          .from("addon_groups")
          .select("id,nome,menu_category_id,obrigatorio,minimo,maximo,ativo")
          .eq("establishment_id", shopId)
          .order("nome"),
        supabase
          .from("menu_categories")
          .select("id,nome")
          .eq("establishment_id", shopId)
          .order("ordem"),
      ]);
      if (g.error || c.error) throw new Error("load");
      const options = g.data.length
        ? await supabase
            .from("addons")
            .select("id,addon_group_id,nome,preco_extra_cents,ativo")
            .in(
              "addon_group_id",
              g.data.map((group) => group.id),
            )
            .order("ordem")
        : { data: [], error: null };
      if (options.error) throw options.error;
      setGroups(g.data);
      setCategories(c.data);
      setAddons(options.data ?? []);
      setLoadError(false);
    } catch {
      setLoadError(true);
      toast.error("Não foi possível carregar os complementos.");
    } finally {
      setLoading(false);
    }
  }, [shopId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  function show(group: CatalogAddonGroup | null) {
    setEditing(group);
    setOpen(true);
  }
  async function remove(group: CatalogAddonGroup) {
    if (
      !confirm(
        'Excluir o grupo "' + group.nome + '"? Ele será removido dos produtos que o utilizam.',
      )
    )
      return;
    const { data, error } = await supabase
      .from("addon_groups")
      .delete()
      .eq("id", group.id)
      .select("id");
    if (error || !data?.length) return toast.error("Não foi possível excluir o grupo.");
    toast.success("Grupo excluído.");
    void reload();
  }
  const visible = groups.filter(
    (group) =>
      (filter === "all" ||
        (filter === "general" ? !group.menu_category_id : group.menu_category_id === filter)) &&
      group.nome.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")),
  );
  const sections = [...new Set(visible.map((group) => group.menu_category_id))];
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Complementos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize as opções por categoria e selecione nos produtos.
          </p>
        </div>
        <Button className="rounded-xl" onClick={() => show(null)} disabled={loading || loadError}>
          <Plus className="mr-2 h-4 w-4" />
          Novo grupo
        </Button>
      </div>
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 sm:flex-row">
        <Input
          aria-label="Buscar grupo de complementos"
          placeholder="Buscar grupo..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="rounded-xl sm:max-w-sm"
        />
        <select
          aria-label="Filtrar complementos por categoria"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="h-10 rounded-xl border border-input bg-background px-3 text-sm sm:ml-auto"
        >
          <option value="all">Todas as categorias</option>
          <option value="general">Uso geral</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.nome}
            </option>
          ))}
        </select>
      </div>
      {loadError ? (
        <Button variant="outline" onClick={() => void reload()}>
          Tentar novamente
        </Button>
      ) : loading ? (
        <p role="status" className="p-8 text-center text-sm text-muted-foreground">
          Carregando complementos...
        </p>
      ) : (
        sections.map((categoryId) => (
          <section key={categoryId ?? "general"} className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {categories.find((category) => category.id === categoryId)?.nome ?? "Uso geral"}
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {visible
                .filter((group) => group.menu_category_id === categoryId)
                .map((group) => {
                  const items = addons.filter((option) => option.addon_group_id === group.id);
                  return (
                    <article
                      key={group.id}
                      className="rounded-2xl border border-border bg-card p-4 shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary">
                          <Layers3 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="break-words font-semibold">{group.nome}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {group.obrigatorio ? "Obrigatório" : "Opcional"} ·{" "}
                            {group.maximo === 0
                              ? "Sem limite"
                              : group.minimo + " a " + group.maximo + " escolha(s)"}{" "}
                            · {items.length} opções{!group.ativo && " · Inativo"}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={"Excluir grupo " + group.nome}
                          onClick={() => remove(group)}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                      <div className="my-4 flex flex-wrap gap-1.5">
                        {items.slice(0, 4).map((item) => (
                          <span key={item.id} className="rounded-lg bg-muted/50 px-2 py-1 text-xs">
                            {item.nome}
                            <span className="ml-1.5 text-muted-foreground">
                              {item.preco_extra_cents
                                ? "+ " + fmt(item.preco_extra_cents)
                                : "Grátis"}
                            </span>
                          </span>
                        ))}
                        {items.length > 4 && (
                          <span className="px-2 py-1 text-xs text-muted-foreground">
                            +{items.length - 4} opções
                          </span>
                        )}
                        {!items.length && (
                          <p className="text-xs text-muted-foreground">
                            Adicione as opções em Editar grupo.
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full rounded-xl"
                        onClick={() => show(group)}
                      >
                        <Pencil className="mr-2 h-3.5 w-3.5" />
                        Editar grupo
                      </Button>
                    </article>
                  );
                })}
            </div>
          </section>
        ))
      )}
      {!loading && !loadError && !visible.length && (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {groups.length
            ? "Nenhum grupo encontrado."
            : "Crie seu primeiro grupo, como Bordas, Molhos ou Adicionais."}
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-xl">
          {open && shopId && (
            <GroupEditor
              shopId={shopId}
              group={editing}
              options={addons.filter((option) => option.addon_group_id === editing?.id)}
              categories={categories}
              onSaved={() => {
                setOpen(false);
                void reload();
              }}
              onCancel={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function GroupEditor({
  shopId,
  group,
  options,
  categories,
  onSaved,
  onCancel,
}: {
  shopId: string;
  group: CatalogAddonGroup | null;
  options: Addon[];
  categories: ProductCategory[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState(group?.menu_category_id ?? "");
  const [draft, setDraft] = useState<AddonDraft>(() =>
    group
      ? {
          key: group.id,
          nome: group.nome,
          obrigatorio: group.obrigatorio,
          minimo: group.minimo,
          maximo: group.maximo,
          itens: options.length
            ? options.map((option) => ({
                key: option.id,
                nome: option.nome,
                preco: (option.preco_extra_cents / 100).toFixed(2),
              }))
            : [{ key: crypto.randomUUID(), nome: "", preco: "0.00" }],
        }
      : addonDraft(),
  );
  const [saving, setSaving] = useState(false);
  const kind = getCategoryKind(categories.find((item) => item.id === category)?.nome);
  const templates = (
    Object.entries(ADDON_TEMPLATES) as [CategoryKind, (typeof ADDON_TEMPLATES)[CategoryKind]][]
  ).flatMap(([key, values]) =>
    kind === "outro" || key === kind
      ? values.map((template, index) => ({
          id: key + ":" + index,
          label: KIND_LABEL[key] + " · " + template.nome,
          template,
        }))
      : [],
  );
  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const payload = validateAddonDrafts([draft])[0];
      const known = new Set(options.map((option) => option.id));
      const result = await supabase.rpc("save_addon_group_configuration", {
        p_establishment_id: shopId,
        p_group_id: group?.id ?? null,
        p_category_id: category || null,
        p_group: {
          ...payload,
          itens: payload.itens.map((item, index) => ({
            ...item,
            ...(known.has(draft.itens[index].key) ? { id: draft.itens[index].key } : {}),
          })),
        },
      });
      if (result.error || !result.data)
        throw new Error(result.error?.message ?? "O banco não confirmou o salvamento.");
      toast.success("Grupo e opções salvos.");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>{group ? "Editar grupo" : "Novo grupo de complementos"}</DialogTitle>
        <DialogDescription>
          {group
            ? "As alterações serão aplicadas aos produtos que usam este grupo."
            : "Cadastre as opções aqui e depois selecione o grupo no produto."}
        </DialogDescription>
      </DialogHeader>
      <fieldset disabled={saving} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="addon-category">Categoria de uso</Label>
          <select
            id="addon-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
          >
            <option value="">Uso geral · qualquer produto</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </div>
        {!group && !!templates.length && (
          <select
            aria-label="Modelo de complementos"
            value=""
            onChange={(event) => {
              const selected = templates.find((item) => item.id === event.target.value);
              if (selected) setDraft(addonDraft(selected.template));
            }}
            className="h-10 w-full rounded-xl border border-input bg-muted/20 px-3 text-sm"
          >
            <option value="">Começar com um modelo (opcional)</option>
            {templates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="addon-name">Nome do grupo</Label>
          <Input
            id="addon-name"
            placeholder="Ex.: Bordas recheadas"
            value={draft.nome}
            onChange={(event) => setDraft({ ...draft, nome: event.target.value })}
          />
        </div>
        <div className="rounded-xl border border-border p-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="addon-required">Escolha obrigatória</Label>
            <Switch
              id="addon-required"
              checked={draft.obrigatorio}
              onCheckedChange={(required) =>
                setDraft({
                  ...draft,
                  obrigatorio: required,
                  minimo: required ? Math.max(1, draft.minimo) : 0,
                })
              }
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="addon-min" className="text-xs">
                Mínimo de escolhas
              </Label>
              <Input
                id="addon-min"
                type="number"
                min={draft.obrigatorio ? 1 : 0}
                value={draft.minimo}
                onChange={(event) => setDraft({ ...draft, minimo: Number(event.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addon-max" className="text-xs">
                Máximo (0 = sem limite)
              </Label>
              <Input
                id="addon-max"
                type="number"
                min="0"
                value={draft.maximo}
                onChange={(event) => setDraft({ ...draft, maximo: Number(event.target.value) })}
              />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_5.5rem_2.5rem] gap-2 text-xs font-medium text-muted-foreground">
            <span>Opção</span>
            <span>Extra (R$)</span>
            <span />
          </div>
          {draft.itens.map((item, index) => (
            <div key={item.key} className="grid grid-cols-[1fr_5.5rem_2.5rem] gap-2">
              <Input
                aria-label={"Nome da opção " + (index + 1)}
                placeholder="Ex.: Catupiry"
                value={item.nome}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    itens: draft.itens.map((option) =>
                      option.key === item.key ? { ...option, nome: event.target.value } : option,
                    ),
                  })
                }
              />
              <Input
                aria-label={"Preço da opção " + (index + 1)}
                inputMode="decimal"
                value={item.preco}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    itens: draft.itens.map((option) =>
                      option.key === item.key ? { ...option, preco: event.target.value } : option,
                    ),
                  })
                }
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={"Remover opção " + (index + 1)}
                disabled={draft.itens.length <= 1}
                onClick={() =>
                  setDraft({
                    ...draft,
                    itens: draft.itens.filter((option) => option.key !== item.key),
                  })
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              setDraft({
                ...draft,
                itens: [...draft.itens, { key: crypto.randomUUID(), nome: "", preco: "0.00" }],
              })
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Adicionar opção
          </Button>
          <p className="text-xs text-muted-foreground">Use 0,00 para opções gratuitas.</p>
        </div>
      </fieldset>
      <DialogFooter>
        <Button variant="outline" disabled={saving} onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar grupo
        </Button>
      </DialogFooter>
    </>
  );
}
