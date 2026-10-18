import {
  CATEGORY_CATALOG,
  normalizedCategory,
  type CategoryPreset,
} from "./product-category-catalog.ts";
export type DeliveryNiche = {
  slug: string;
  name: string;
  icon: string;
  aliases: string[];
  sections: string[];
};
const niche = (
  slug: string,
  name: string,
  icon: string,
  sections: string[],
  aliases: string[] = [],
): DeliveryNiche => ({ slug, name, icon, sections, aliases });
export const DELIVERY_NICHES: DeliveryNiche[] = [
  niche(
    "hamburguer",
    "Hamburgueria",
    "🍔",
    ["Lanches e fast food", "Bebidas"],
    [
      "hamburgueria",
      "hamburguerias",
      "hamburguer",
      "hamburgueres",
      "burger",
      "lanchonete",
      "lanchonetes",
    ],
  ),
  niche("pizza", "Pizza", "🍕", ["Pizzaria", "Bebidas"], ["pizzaria", "pizzarias", "pizzas"]),
  niche(
    "sushi",
    "Sushi",
    "🍣",
    ["Japonês e oriental", "Bebidas"],
    ["japones", "japonesa", "oriental"],
  ),
  niche(
    "marmita",
    "Marmitaria",
    "🍱",
    ["Refeições", "Bebidas"],
    ["marmitex", "marmitas", "restaurante", "restaurantes"],
  ),
  niche("frango", "Frango", "🍗", ["Refeições", "Bebidas"], ["frangaria", "frango assado"]),
  niche(
    "churrasco",
    "Churrasco",
    "🍖",
    ["Refeições", "Bebidas"],
    ["churrascaria", "churrascarias"],
  ),
  niche(
    "saudavel",
    "Saudável",
    "🥗",
    ["Refeições", "Hortifruti", "Bebidas"],
    ["fitness", "vegano", "vegetariano", "saladas"],
  ),
  niche("mexicana", "Mexicana", "🌮", ["Refeições", "Bebidas"], ["mexicano", "tacos", "burritos"]),
  niche("massas", "Massas", "🍝", ["Refeições", "Bebidas"], ["italiana", "italiano", "macarrao"]),
  niche(
    "padaria",
    "Padaria",
    "🥐",
    ["Padaria", "Bebidas"],
    ["padarias", "panificadora", "panificadoras", "pao", "paes"],
  ),
  niche(
    "pastel",
    "Salgaderia",
    "🥟",
    ["Salgados e pastéis", "Bebidas"],
    ["pastelaria", "pastelarias", "salgados", "salgaderias"],
  ),
  niche(
    "lanches",
    "Lanchonete",
    "🥪",
    ["Lanches e fast food", "Bebidas"],
    ["lanchonetes", "lanches", "sanduiche", "sanduiches", "fast food"],
  ),
  niche(
    "doces",
    "Doces",
    "🍰",
    ["Doces e sobremesas"],
    ["doceria", "docerias", "confeitaria", "confeitarias", "bolos"],
  ),
  niche("chocolates", "Chocolates", "🍫", ["Doces e sobremesas"], ["chocolateria", "chocolate"]),
  niche(
    "sorvete",
    "Sorvetes",
    "🍨",
    ["Açaí e sorvetes"],
    ["sorveteria", "sorveterias", "picole", "gelato"],
  ),
  niche("acai", "Açaí", "🍧", ["Açaí e sorvetes"], ["acaiteria", "acaiterias"]),
  niche(
    "bebidas",
    "Bebidas",
    "🥤",
    ["Bebidas"],
    ["distribuidora", "distribuidoras", "adega", "adegas", "refrigerantes", "cervejas"],
  ),
  niche(
    "cafeteria",
    "Cafeteria",
    "☕",
    ["Bebidas", "Padaria", "Doces e sobremesas"],
    ["cafeterias", "cafe", "coffee"],
  ),
  niche(
    "porcoes",
    "Porções",
    "🍟",
    ["Lanches e fast food", "Bebidas"],
    ["petiscos", "porcao", "bar", "bares"],
  ),
  niche(
    "mercado",
    "Mercado",
    "🛒",
    ["Mercado e secos e molhados", "Hortifruti", "Bebidas"],
    ["mercados", "supermercado", "supermercados", "mercearia", "mercearias", "secos e molhados"],
  ),
  niche(
    "farmacia",
    "Farmácia",
    "💊",
    ["Farmácia"],
    ["farmacias", "drogaria", "drogarias", "perfumaria", "medicamentos"],
  ),
  niche(
    "restaurante",
    "Restaurante",
    "🍽️",
    ["Refeições", "Bebidas"],
    ["restaurantes", "comida", "almoco", "jantar"],
  ),
  niche(
    "floricultura",
    "Floricultura",
    "💐",
    ["Floricultura"],
    ["floriculturas", "flores", "buques", "florista"],
  ),
  niche(
    "petshop",
    "Pet shop",
    "🐾",
    ["Pet shop"],
    ["pet shops", "petshop", "petshops", "racao", "racoes", "animais"],
  ),
  niche(
    "hortifruti",
    "Hortifruti",
    "🥬",
    ["Hortifruti"],
    ["hortifrútis", "sacolao", "sacoloes", "verduras", "frutas", "legumes"],
  ),
  niche(
    "acougue",
    "Açougue",
    "🥩",
    ["Açougue e peixaria"],
    ["acougues", "carnes", "casa de carnes"],
  ),
  niche(
    "peixaria",
    "Peixaria",
    "🐟",
    ["Açougue e peixaria"],
    ["peixarias", "peixes", "frutos do mar"],
  ),
  niche(
    "conveniencia",
    "Conveniência",
    "🏪",
    ["Conveniência e utilidades", "Bebidas"],
    ["conveniencias", "loja de conveniencia"],
  ),
  niche(
    "cosmeticos",
    "Cosméticos e perfumaria",
    "🧴",
    ["Farmácia"],
    ["cosmetico", "cosmeticos", "perfumaria", "perfumes", "beleza"],
  ),
  niche(
    "presentes",
    "Presentes",
    "🎁",
    ["Floricultura", "Conveniência e utilidades"],
    ["presente", "cestas", "lembrancas"],
  ),
  niche(
    "encomendas",
    "Despachos e encomendas",
    "📦",
    ["Despachos e encomendas"],
    ["despacho", "despachos", "encomenda", "encomendas", "documentos", "coleta"],
  ),
];
export function getNiche(slug?: string | null) {
  return DELIVERY_NICHES.find((item) => item.slug === slug);
}
export function nicheCategories(slug?: string | null): CategoryPreset[] {
  const profile = getNiche(slug);
  if (!profile) return CATEGORY_CATALOG;
  return CATEGORY_CATALOG.filter((item) =>
    profile.sections.some(
      (section) => normalizedCategory(section) === normalizedCategory(item.section),
    ),
  );
}
export function recommendedCategories(slug?: string | null): CategoryPreset[] {
  const presets = nicheCategories(slug);
  if (!getNiche(slug)) return [];
  const profile = getNiche(slug)!;
  const main = presets.filter((item) => item.section === profile.sections[0]).slice(0, 6);
  const drinks = presets.filter((item) => item.section === "Bebidas").slice(0, 2);
  return [
    ...new Map([...main, ...drinks].map((item) => [item.section + "/" + item.name, item])).values(),
  ];
}
