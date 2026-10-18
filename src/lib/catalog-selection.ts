export type ProductCategory = { id: string; nome: string };
export type CatalogAddonGroup = {
  id: string;
  nome: string;
  menu_category_id: string | null;
  obrigatorio: boolean;
  minimo: number;
  maximo: number;
  ativo: boolean;
};
export function partitionAddonGroups(
  groups: CatalogAddonGroup[],
  categoryId: string,
  selected: Set<string>,
) {
  return {
    recommended: groups.filter(
      (group) => !group.menu_category_id || group.menu_category_id === categoryId,
    ),
    selectedElsewhere: groups.filter(
      (group) =>
        !!group.menu_category_id && group.menu_category_id !== categoryId && selected.has(group.id),
    ),
    other: groups.filter(
      (group) =>
        !!group.menu_category_id &&
        group.menu_category_id !== categoryId &&
        !selected.has(group.id),
    ),
  };
}
