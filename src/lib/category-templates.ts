// Templates de configuração por tipo de categoria.
// A "categoria" da loja (nome da menu_category) determina quais campos e
// grupos de complementos fazem sentido — bebida pede volume/embalagem,
// lanche pede adicionais como bacon/ovo, pizza pede tamanho/borda, etc.

export type CategoryKind =
  "bebida" | "lanche" | "pizza" | "sobremesa" | "acai" | "marmita" | "pastel" | "sushi" | "outro";

const KEYWORDS: Array<[CategoryKind, RegExp]> = [
  [
    "bebida",
    /\b(bebida|refri|refrigerante|suco|agua|água|cerveja|drink|drinque|cha|chá|cafe|café|energetico|energético|vinho|coquetel|milk\s?shake|milkshake|smoothie)\b/i,
  ],
  ["pizza", /\b(pizza|pizzas|calzone|esfiha)\b/i],
  ["acai", /\b(acai|açaí|açai|acaí|sorvete|gelato|picole|picolé)\b/i],
  ["sushi", /\b(sushi|sashimi|temaki|combinado|hot\s?roll|yakisoba|japones|japonês)\b/i],
  ["pastel", /\b(pastel|pasteis|pastéis|salgado|salgados|coxinha|esfirra|kibe|quibe|empada)\b/i],
  [
    "marmita",
    /\b(marmita|marmitex|prato|refeicao|refeição|self|almoco|almoço|jantar|executivo|caseira)\b/i,
  ],
  [
    "sobremesa",
    /\b(sobremesa|doce|bolo|torta|pudim|mousse|brigadeiro|beijinho|churros|cheesecake)\b/i,
  ],
  [
    "lanche",
    /\b(lanche|lanches|hamb|hambur|burger|burguer|x-|sanduba|sanduíche|sanduiche|hot\s?dog|cachorro\s?quente|wrap|artesanal)\b/i,
  ],
];

export function getCategoryKind(name?: string | null): CategoryKind {
  if (!name) return "outro";
  for (const [kind, rx] of KEYWORDS) if (rx.test(name)) return kind;
  return "outro";
}

export const KIND_LABEL: Record<CategoryKind, string> = {
  bebida: "Bebida",
  lanche: "Lanche",
  pizza: "Pizza",
  sobremesa: "Sobremesa",
  acai: "Açaí / Sorvete",
  marmita: "Marmita / Prato",
  pastel: "Salgado / Pastel",
  sushi: "Japonês / Sushi",
  outro: "Geral",
};

export const KIND_HINT: Record<CategoryKind, string> = {
  bebida:
    "Configure volume (ml/L) e embalagem. Use variações para Lata, Garrafa, 1L, 2L com preços diferentes.",
  lanche:
    "Configure adicionais pagos (bacon, ovo, queijo extra) e opções de ponto da carne. Deixe o cliente montar do jeito dele.",
  pizza:
    "Configure tamanhos (P/M/G/GG), bordas recheadas e quantos sabores o cliente pode escolher.",
  sobremesa: "Adicione coberturas e acompanhamentos opcionais.",
  acai: "Configure tamanhos (300/500/700ml) e complementos como frutas, granola, leite condensado.",
  marmita: "Configure tamanhos (P/M/G) e acompanhamentos (arroz, feijão, salada, farofa).",
  pastel: "Configure recheios e molhos que acompanham.",
  sushi:
    "Configure quantidade de peças, tipos de peixe e acompanhamentos (shoyu, wasabi, gengibre).",
  outro: "Configure grupos de complementos conforme necessário.",
};

// Campos extras específicos por tipo (renderizados no formulário do produto).
export type ExtraFieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  suffix?: string;
};
export const EXTRA_FIELDS: Record<CategoryKind, ExtraFieldDef[]> = {
  bebida: [
    { key: "volume_ml", label: "Volume", placeholder: "350", suffix: "ml" },
    { key: "embalagem", label: "Embalagem", placeholder: "Lata / Garrafa PET / Vidro" },
    { key: "marca", label: "Marca", placeholder: "Coca-Cola, Guaraná..." },
  ],
  lanche: [
    { key: "peso_g", label: "Peso do hambúrguer", placeholder: "150", suffix: "g" },
    {
      key: "ingredientes",
      label: "Ingredientes principais",
      placeholder: "Pão, blend 150g, queijo, alface...",
    },
  ],
  pizza: [
    { key: "num_fatias", label: "Nº de fatias", placeholder: "8" },
    { key: "sabores_max", label: "Sabores máximos", placeholder: "2" },
  ],
  sobremesa: [{ key: "peso_g", label: "Peso / porção", placeholder: "120", suffix: "g" }],
  acai: [{ key: "volume_ml", label: "Volume", placeholder: "500", suffix: "ml" }],
  marmita: [{ key: "peso_g", label: "Peso", placeholder: "700", suffix: "g" }],
  pastel: [{ key: "tamanho", label: "Tamanho", placeholder: "Grande / Broto" }],
  sushi: [{ key: "pecas", label: "Nº de peças", placeholder: "10" }],
  outro: [],
};

// Templates de grupos de complementos que o lojista pode aplicar com 1 clique.
export type AddonTemplate = {
  nome: string;
  obrigatorio: boolean;
  minimo: number;
  maximo: number;
  itens: Array<{ nome: string; preco_extra_cents: number }>;
};

export const ADDON_TEMPLATES: Record<CategoryKind, AddonTemplate[]> = {
  bebida: [
    {
      nome: "Gelado?",
      obrigatorio: true,
      minimo: 1,
      maximo: 1,
      itens: [
        { nome: "Sim, bem gelada", preco_extra_cents: 0 },
        { nome: "Natural", preco_extra_cents: 0 },
      ],
    },
    {
      nome: "Copo com gelo",
      obrigatorio: false,
      minimo: 0,
      maximo: 1,
      itens: [{ nome: "Enviar copo com gelo", preco_extra_cents: 0 }],
    },
  ],
  lanche: [
    {
      nome: "Adicionais",
      obrigatorio: false,
      minimo: 0,
      maximo: 8,
      itens: [
        { nome: "Bacon", preco_extra_cents: 500 },
        { nome: "Ovo", preco_extra_cents: 300 },
        { nome: "Queijo extra", preco_extra_cents: 400 },
        { nome: "Cheddar", preco_extra_cents: 400 },
        { nome: "Catupiry", preco_extra_cents: 400 },
        { nome: "Cebola caramelizada", preco_extra_cents: 300 },
      ],
    },
    {
      nome: "Ponto da carne",
      obrigatorio: true,
      minimo: 1,
      maximo: 1,
      itens: [
        { nome: "Ao ponto", preco_extra_cents: 0 },
        { nome: "Bem passada", preco_extra_cents: 0 },
        { nome: "Mal passada", preco_extra_cents: 0 },
      ],
    },
    {
      nome: "Retirar ingredientes",
      obrigatorio: false,
      minimo: 0,
      maximo: 5,
      itens: [
        { nome: "Sem cebola", preco_extra_cents: 0 },
        { nome: "Sem tomate", preco_extra_cents: 0 },
        { nome: "Sem alface", preco_extra_cents: 0 },
        { nome: "Sem picles", preco_extra_cents: 0 },
      ],
    },
  ],
  pizza: [
    {
      nome: "Borda",
      obrigatorio: true,
      minimo: 1,
      maximo: 1,
      itens: [
        { nome: "Tradicional (sem recheio)", preco_extra_cents: 0 },
        { nome: "Catupiry", preco_extra_cents: 800 },
        { nome: "Cheddar", preco_extra_cents: 800 },
        { nome: "Chocolate", preco_extra_cents: 900 },
      ],
    },
    {
      nome: "Massa",
      obrigatorio: true,
      minimo: 1,
      maximo: 1,
      itens: [
        { nome: "Tradicional", preco_extra_cents: 0 },
        { nome: "Fina", preco_extra_cents: 0 },
      ],
    },
  ],
  sobremesa: [
    {
      nome: "Cobertura",
      obrigatorio: false,
      minimo: 0,
      maximo: 3,
      itens: [
        { nome: "Chocolate", preco_extra_cents: 200 },
        { nome: "Morango", preco_extra_cents: 200 },
        { nome: "Leite condensado", preco_extra_cents: 200 },
      ],
    },
  ],
  acai: [
    {
      nome: "Frutas",
      obrigatorio: false,
      minimo: 0,
      maximo: 4,
      itens: [
        { nome: "Banana", preco_extra_cents: 100 },
        { nome: "Morango", preco_extra_cents: 300 },
        { nome: "Kiwi", preco_extra_cents: 400 },
      ],
    },
    {
      nome: "Complementos",
      obrigatorio: false,
      minimo: 0,
      maximo: 6,
      itens: [
        { nome: "Granola", preco_extra_cents: 200 },
        { nome: "Leite condensado", preco_extra_cents: 200 },
        { nome: "Leite em pó", preco_extra_cents: 200 },
        { nome: "Paçoca", preco_extra_cents: 200 },
        { nome: "Chocolate", preco_extra_cents: 300 },
      ],
    },
  ],
  marmita: [
    {
      nome: "Acompanhamentos",
      obrigatorio: true,
      minimo: 2,
      maximo: 4,
      itens: [
        { nome: "Arroz branco", preco_extra_cents: 0 },
        { nome: "Feijão", preco_extra_cents: 0 },
        { nome: "Salada", preco_extra_cents: 0 },
        { nome: "Farofa", preco_extra_cents: 0 },
        { nome: "Batata frita", preco_extra_cents: 300 },
      ],
    },
  ],
  pastel: [
    {
      nome: "Molhos",
      obrigatorio: false,
      minimo: 0,
      maximo: 3,
      itens: [
        { nome: "Ketchup", preco_extra_cents: 0 },
        { nome: "Maionese", preco_extra_cents: 0 },
        { nome: "Mostarda", preco_extra_cents: 0 },
        { nome: "Molho da casa", preco_extra_cents: 200 },
      ],
    },
  ],
  sushi: [
    {
      nome: "Acompanhamentos",
      obrigatorio: false,
      minimo: 0,
      maximo: 3,
      itens: [
        { nome: "Shoyu extra", preco_extra_cents: 0 },
        { nome: "Wasabi", preco_extra_cents: 0 },
        { nome: "Gengibre", preco_extra_cents: 0 },
      ],
    },
    {
      nome: "Hashi",
      obrigatorio: false,
      minimo: 0,
      maximo: 1,
      itens: [{ nome: "Enviar hashi", preco_extra_cents: 0 }],
    },
  ],
  outro: [],
};

// Presets de variações (product_variants) — nome + sugestão de preço em cents
export type VariantTemplate = { nome: string; preco_cents: number };
export const VARIANT_TEMPLATES: Record<CategoryKind, VariantTemplate[]> = {
  bebida: [
    { nome: "Lata 350ml", preco_cents: 600 },
    { nome: "Garrafa 600ml", preco_cents: 900 },
    { nome: "1 Litro", preco_cents: 1200 },
    { nome: "2 Litros", preco_cents: 1500 },
  ],
  pizza: [
    { nome: "Pequena (4 fatias)", preco_cents: 3500 },
    { nome: "Média (6 fatias)", preco_cents: 4500 },
    { nome: "Grande (8 fatias)", preco_cents: 5500 },
    { nome: "Família (12 fatias)", preco_cents: 7500 },
  ],
  acai: [
    { nome: "300ml", preco_cents: 1200 },
    { nome: "500ml", preco_cents: 1800 },
    { nome: "700ml", preco_cents: 2400 },
    { nome: "1 Litro", preco_cents: 3200 },
  ],
  marmita: [
    { nome: "P", preco_cents: 1800 },
    { nome: "M", preco_cents: 2400 },
    { nome: "G", preco_cents: 3000 },
  ],
  sushi: [
    { nome: "10 peças", preco_cents: 3500 },
    { nome: "20 peças", preco_cents: 6500 },
    { nome: "40 peças", preco_cents: 12000 },
  ],
  lanche: [],
  sobremesa: [],
  pastel: [],
  outro: [],
};
