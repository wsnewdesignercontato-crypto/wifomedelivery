export function priceInCents(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized))
    throw new Error("Use um preço válido, com até duas casas decimais.");
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 100000000)
    throw new Error("Preço fora do limite.");
  return cents;
}
export function validateAddonDrafts(
  groups: Array<{
    nome: string;
    obrigatorio: boolean;
    minimo: number;
    maximo: number;
    itens: Array<{ nome: string; preco: string }>;
  }>,
) {
  return groups.map((group) => {
    if (
      !group.nome.trim() ||
      !Number.isInteger(group.minimo) ||
      !Number.isInteger(group.maximo) ||
      group.minimo < 0 ||
      group.maximo < 0 ||
      (group.obrigatorio && group.minimo < 1) ||
      (group.maximo > 0 && group.maximo < group.minimo) ||
      group.itens.length < Math.max(1, group.minimo)
    )
      throw new Error("Revise o nome, as opções e os limites dos adicionais.");
    return {
      nome: group.nome.trim(),
      obrigatorio: group.obrigatorio,
      minimo: group.minimo,
      maximo: group.maximo,
      itens: group.itens.map((item) => {
        if (!item.nome.trim()) throw new Error("Preencha o nome de cada opção adicional.");
        return { nome: item.nome.trim(), preco_extra_cents: priceInCents(item.preco) };
      }),
    };
  });
}
