import {
  EXTRA_FIELDS,
  getCategoryKind,
  ADDON_TEMPLATES,
  type AddonTemplate,
} from "./category-templates.ts";
import { normalizedCategory } from "./product-category-catalog.ts";
export type ProductField = {
  key: string;
  label: string;
  placeholder?: string;
  suffix?: string;
  numeric?: boolean;
  options?: string[];
};
export function productFields(categoryName?: string | null): ProductField[] {
  const name = normalizedCategory(categoryName ?? "");
  const kind = getCategoryKind(categoryName);
  if (kind === "bebida")
    return [
      { key: "volume_ml", label: "Volume", placeholder: "Ex.: 350", suffix: "ml", numeric: true },
      {
        key: "embalagem",
        label: "Embalagem",
        options: ["Lata", "Garrafa", "Copo", "Caixa", "Sachê", "Outra"],
      },
      { key: "marca", label: "Marca", placeholder: "Opcional" },
      { key: "sabor", label: "Sabor", placeholder: "Opcional" },
    ];
  if (
    /farmacia|medicamento|higiene|cosmetico|dermocosmetico|vitamina|suplemento|primeiro socorro|infantil|bebe/.test(
      name,
    )
  )
    return [
      { key: "marca", label: "Marca", placeholder: "Opcional" },
      { key: "apresentacao", label: "Apresentação", placeholder: "Ex.: caixa, frasco ou bisnaga" },
      { key: "conteudo", label: "Conteúdo", placeholder: "Ex.: 30", numeric: true },
      { key: "unidade", label: "Unidade", options: ["unidades", "ml", "g", "L", "kg"] },
    ];
  if (/floricultura|buque|arranjo|plantas|vasos|cestas|presentes/.test(name))
    return [
      { key: "cor", label: "Cor", placeholder: "Ex.: vermelhas" },
      { key: "quantidade", label: "Quantidade de itens", numeric: true, placeholder: "Ex.: 12" },
      { key: "tamanho", label: "Tamanho", placeholder: "Ex.: médio" },
      { key: "embalagem", label: "Embalagem", placeholder: "Ex.: caixa ou papel" },
    ];
  if (kind !== "outro")
    return EXTRA_FIELDS[kind].map((field) => ({
      ...field,
      numeric: ["volume_ml", "peso_g", "num_fatias", "sabores_max", "pecas"].includes(field.key),
    }));
  if (
    /mercado|secos|molhados|hortifruti|frutas|verduras|legumes|ovos|carnes|acougue|peix|aves|racao|pet shop|padaria|paes|frios|laticinios|conveniencia/.test(
      name,
    )
  )
    return [
      { key: "marca", label: "Marca", placeholder: "Opcional" },
      { key: "conteudo", label: "Peso / quantidade", placeholder: "Ex.: 500", numeric: true },
      { key: "unidade", label: "Unidade", options: ["g", "kg", "ml", "L", "unidades", "pacotes"] },
      { key: "embalagem", label: "Embalagem", placeholder: "Ex.: pacote ou bandeja" },
    ];
  return [];
}
export function categoryAddonTemplates(categoryName?: string | null): AddonTemplate[] {
  const kind = getCategoryKind(categoryName);
  if (kind !== "outro") return ADDON_TEMPLATES[kind];
  const name = normalizedCategory(categoryName ?? "");
  if (/floricultura|buque|arranjo|presentes|cestas/.test(name))
    return [
      {
        nome: "Embalagem para presente",
        obrigatorio: false,
        minimo: 0,
        maximo: 1,
        itens: [{ nome: "Embalagem para presente", preco_extra_cents: 0 }],
      },
    ];
  return [];
}
const labels: Record<string, string> = {
  volume_ml: "Volume",
  peso_g: "Peso",
  num_fatias: "Fatias",
  sabores_max: "Sabores máximos",
  pecas: "Peças",
  marca: "Marca",
  sabor: "Sabor",
  embalagem: "Embalagem",
  apresentacao: "Apresentação",
  conteudo: "Conteúdo",
  unidade: "Unidade",
  cor: "Cor",
  quantidade: "Quantidade",
  tamanho: "Tamanho",
  ingredientes: "Ingredientes",
};
export function readProductDetails(raw?: string | null) {
  const attributes: Record<string, string> = {};
  const description = (raw ?? "")
    .replace(/\s*\[\[extras:([^\]]*)\]\]/g, (_, body: string) => {
      for (const pair of body.split(";")) {
        const [key, ...parts] = pair.split("=");
        if (/^[a-z_]{1,40}$/.test(key.trim()) && parts.length)
          attributes[key.trim()] = parts.join("=").trim();
      }
      return "";
    })
    .trim();
  return { description, attributes };
}
export function detailBadges(raw?: string | null) {
  const { attributes } = readProductDetails(raw);
  return Object.entries(attributes)
    .filter(([key, value]) => value && key !== "unidade")
    .map(([key, value]) => {
      const suffix =
        key === "volume_ml"
          ? " ml"
          : key === "peso_g"
            ? " g"
            : key === "conteudo" && attributes.unidade
              ? " " + attributes.unidade
              : "";
      return { key, label: labels[key] ?? key.replace(/_/g, " "), value: value + suffix };
    });
}
export function productSummary(raw?: string | null) {
  const details = readProductDetails(raw);
  return [details.description, ...detailBadges(raw).map((item) => item.label + ": " + item.value)]
    .filter(Boolean)
    .join(" · ");
}
export function productSnapshotName(name: string, raw?: string | null) {
  const { attributes } = readProductDetails(raw);
  const amount = attributes.volume_ml
    ? attributes.volume_ml + " ml"
    : attributes.peso_g
      ? attributes.peso_g + " g"
      : attributes.conteudo && attributes.unidade
        ? attributes.conteudo + " " + attributes.unidade
        : null;
  return amount ? name + " · " + amount : name;
}
export function writeProductDetails(
  raw: string,
  attributes: Record<string, string>,
  fields: ProductField[],
) {
  for (const field of fields) {
    const value = attributes[field.key]?.trim();
    if (
      value &&
      field.numeric &&
      (!/^\d+(?:[.,]\d{1,3})?$/.test(value) || Number(value.replace(",", ".")) <= 0)
    )
      throw new Error("Informe " + field.label.toLocaleLowerCase("pt-BR") + " maior que zero.");
  }
  const description = readProductDetails(raw).description;
  const entries = Object.entries(attributes)
    .filter(([, value]) => value.trim())
    .map(([key, value]) => key + "=" + value.replace(/[;\]]/g, "").slice(0, 200));
  return entries.length
    ? description + (description ? "\n\n" : "") + "[[extras:" + entries.join(";") + "]]"
    : description;
}
