import type { CategoryKind } from "./category-templates.ts";
export type CategoryPreset = { section: string; name: string; kind: CategoryKind };
export const CATEGORY_CATALOG: CategoryPreset[] = [
  {
    section: "Lanches e fast food",
    name: "Hambúrgueres",
    kind: "lanche",
  },
  {
    section: "Lanches e fast food",
    name: "Lanches",
    kind: "lanche",
  },
  {
    section: "Lanches e fast food",
    name: "Cachorro-quente",
    kind: "lanche",
  },
  {
    section: "Lanches e fast food",
    name: "Sanduíches",
    kind: "lanche",
  },
  {
    section: "Lanches e fast food",
    name: "Combos",
    kind: "lanche",
  },
  {
    section: "Lanches e fast food",
    name: "Porções",
    kind: "lanche",
  },
  {
    section: "Pizzaria",
    name: "Pizzas",
    kind: "pizza",
  },
  {
    section: "Pizzaria",
    name: "Pizzas doces",
    kind: "pizza",
  },
  {
    section: "Pizzaria",
    name: "Calzones",
    kind: "pizza",
  },
  {
    section: "Pizzaria",
    name: "Esfihas",
    kind: "pizza",
  },
  {
    section: "Salgados e pastéis",
    name: "Salgados",
    kind: "pastel",
  },
  {
    section: "Salgados e pastéis",
    name: "Pastéis",
    kind: "pastel",
  },
  {
    section: "Salgados e pastéis",
    name: "Coxinhas",
    kind: "pastel",
  },
  {
    section: "Salgados e pastéis",
    name: "Empadas",
    kind: "pastel",
  },
  {
    section: "Salgados e pastéis",
    name: "Quibes",
    kind: "pastel",
  },
  {
    section: "Refeições",
    name: "Marmitas",
    kind: "marmita",
  },
  {
    section: "Refeições",
    name: "Pratos executivos",
    kind: "marmita",
  },
  {
    section: "Refeições",
    name: "Comida caseira",
    kind: "marmita",
  },
  {
    section: "Refeições",
    name: "Massas",
    kind: "marmita",
  },
  {
    section: "Refeições",
    name: "Churrasco",
    kind: "marmita",
  },
  {
    section: "Refeições",
    name: "Comida vegetariana",
    kind: "marmita",
  },
  {
    section: "Refeições",
    name: "Comida vegana",
    kind: "marmita",
  },
  {
    section: "Japonês e oriental",
    name: "Sushi",
    kind: "sushi",
  },
  {
    section: "Japonês e oriental",
    name: "Temakis",
    kind: "sushi",
  },
  {
    section: "Japonês e oriental",
    name: "Sashimis",
    kind: "sushi",
  },
  {
    section: "Japonês e oriental",
    name: "Combinados",
    kind: "sushi",
  },
  {
    section: "Japonês e oriental",
    name: "Yakisoba",
    kind: "sushi",
  },
  {
    section: "Bebidas",
    name: "Refrigerantes",
    kind: "bebida",
  },
  {
    section: "Bebidas",
    name: "Sucos",
    kind: "bebida",
  },
  {
    section: "Bebidas",
    name: "Água",
    kind: "bebida",
  },
  {
    section: "Bebidas",
    name: "Cervejas",
    kind: "bebida",
  },
  {
    section: "Bebidas",
    name: "Vinhos",
    kind: "bebida",
  },
  {
    section: "Bebidas",
    name: "Destilados",
    kind: "bebida",
  },
  {
    section: "Bebidas",
    name: "Energéticos",
    kind: "bebida",
  },
  {
    section: "Bebidas",
    name: "Cafés e chás",
    kind: "bebida",
  },
  {
    section: "Bebidas",
    name: "Milk-shakes",
    kind: "bebida",
  },
  {
    section: "Doces e sobremesas",
    name: "Bolos",
    kind: "sobremesa",
  },
  {
    section: "Doces e sobremesas",
    name: "Tortas",
    kind: "sobremesa",
  },
  {
    section: "Doces e sobremesas",
    name: "Brigadeiros",
    kind: "sobremesa",
  },
  {
    section: "Doces e sobremesas",
    name: "Pudins",
    kind: "sobremesa",
  },
  {
    section: "Doces e sobremesas",
    name: "Churros",
    kind: "sobremesa",
  },
  {
    section: "Doces e sobremesas",
    name: "Doces artesanais",
    kind: "sobremesa",
  },
  {
    section: "Açaí e sorvetes",
    name: "Açaí",
    kind: "acai",
  },
  {
    section: "Açaí e sorvetes",
    name: "Sorvetes",
    kind: "acai",
  },
  {
    section: "Açaí e sorvetes",
    name: "Picolés",
    kind: "acai",
  },
  {
    section: "Açaí e sorvetes",
    name: "Gelatos",
    kind: "acai",
  },
  {
    section: "Padaria",
    name: "Pães",
    kind: "outro",
  },
  {
    section: "Padaria",
    name: "Biscoitos",
    kind: "outro",
  },
  {
    section: "Padaria",
    name: "Bolos e cafés",
    kind: "outro",
  },
  {
    section: "Padaria",
    name: "Frios e laticínios",
    kind: "outro",
  },
  {
    section: "Mercado e secos e molhados",
    name: "Arroz e feijão",
    kind: "outro",
  },
  {
    section: "Mercado e secos e molhados",
    name: "Massas e grãos",
    kind: "outro",
  },
  {
    section: "Mercado e secos e molhados",
    name: "Óleos e temperos",
    kind: "outro",
  },
  {
    section: "Mercado e secos e molhados",
    name: "Enlatados e conservas",
    kind: "outro",
  },
  {
    section: "Mercado e secos e molhados",
    name: "Farinhas e açúcar",
    kind: "outro",
  },
  {
    section: "Mercado e secos e molhados",
    name: "Produtos de limpeza",
    kind: "outro",
  },
  {
    section: "Mercado e secos e molhados",
    name: "Higiene pessoal",
    kind: "outro",
  },
  {
    section: "Mercado e secos e molhados",
    name: "Congelados",
    kind: "outro",
  },
  {
    section: "Hortifruti",
    name: "Frutas",
    kind: "outro",
  },
  {
    section: "Hortifruti",
    name: "Verduras",
    kind: "outro",
  },
  {
    section: "Hortifruti",
    name: "Legumes",
    kind: "outro",
  },
  {
    section: "Hortifruti",
    name: "Ovos",
    kind: "outro",
  },
  {
    section: "Açougue e peixaria",
    name: "Carnes bovinas",
    kind: "outro",
  },
  {
    section: "Açougue e peixaria",
    name: "Carnes suínas",
    kind: "outro",
  },
  {
    section: "Açougue e peixaria",
    name: "Aves",
    kind: "outro",
  },
  {
    section: "Açougue e peixaria",
    name: "Peixes",
    kind: "outro",
  },
  {
    section: "Açougue e peixaria",
    name: "Frutos do mar",
    kind: "outro",
  },
  {
    section: "Farmácia",
    name: "Medicamentos",
    kind: "outro",
  },
  {
    section: "Farmácia",
    name: "Higiene e cuidados",
    kind: "outro",
  },
  {
    section: "Farmácia",
    name: "Cosméticos",
    kind: "outro",
  },
  {
    section: "Farmácia",
    name: "Dermocosméticos",
    kind: "outro",
  },
  {
    section: "Farmácia",
    name: "Vitaminas e suplementos",
    kind: "outro",
  },
  {
    section: "Farmácia",
    name: "Primeiros socorros",
    kind: "outro",
  },
  {
    section: "Farmácia",
    name: "Infantil e bebê",
    kind: "outro",
  },
  {
    section: "Floricultura",
    name: "Buquês",
    kind: "outro",
  },
  {
    section: "Floricultura",
    name: "Arranjos",
    kind: "outro",
  },
  {
    section: "Floricultura",
    name: "Plantas",
    kind: "outro",
  },
  {
    section: "Floricultura",
    name: "Vasos",
    kind: "outro",
  },
  {
    section: "Floricultura",
    name: "Cestas e presentes",
    kind: "outro",
  },
  {
    section: "Pet shop",
    name: "Ração para cães",
    kind: "outro",
  },
  {
    section: "Pet shop",
    name: "Ração para gatos",
    kind: "outro",
  },
  {
    section: "Pet shop",
    name: "Petiscos",
    kind: "outro",
  },
  {
    section: "Pet shop",
    name: "Higiene pet",
    kind: "outro",
  },
  {
    section: "Pet shop",
    name: "Brinquedos e acessórios",
    kind: "outro",
  },
  {
    section: "Conveniência e utilidades",
    name: "Snacks e biscoitos",
    kind: "outro",
  },
  {
    section: "Conveniência e utilidades",
    name: "Gelo",
    kind: "outro",
  },
  {
    section: "Conveniência e utilidades",
    name: "Carvão",
    kind: "outro",
  },
  {
    section: "Conveniência e utilidades",
    name: "Descartáveis",
    kind: "outro",
  },
  {
    section: "Conveniência e utilidades",
    name: "Casa e utilidades",
    kind: "outro",
  },
  {
    section: "Despachos e encomendas",
    name: "Documentos",
    kind: "outro",
  },
  {
    section: "Despachos e encomendas",
    name: "Pequenas encomendas",
    kind: "outro",
  },
  {
    section: "Despachos e encomendas",
    name: "Embalagens",
    kind: "outro",
  },
];
export function normalizedCategory(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
export function categoryLabel(preset: CategoryPreset): string {
  return preset.section + " / " + preset.name;
}
export function catalogCategoryKind(value: string): CategoryKind | undefined {
  const normalized = normalizedCategory(value);
  return CATEGORY_CATALOG.find((item) => normalizedCategory(categoryLabel(item)) === normalized)
    ?.kind;
}
