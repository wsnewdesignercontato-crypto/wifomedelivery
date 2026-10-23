export type CatalogCoupon = {
  ativo: boolean;
  starts_at: string | null;
  expires_at: string | null;
  usage_limit: number | null;
  used_count: number;
  type: string;
  percent: number;
  value_cents: number;
};
export type CatalogProduct = {
  preco_cents: number;
  preco_promo_cents: number | null;
  disponivel: boolean;
  estoque: number | null;
};
export type CatalogZone = { ativo: boolean; taxa_cents: number };
export type CatalogFilters = {
  freeDelivery: boolean;
  promotion: boolean;
  discount: boolean;
  online: boolean;
  rating: boolean;
};
export type CatalogFacts = {
  promotion: boolean;
  discount: boolean;
  online: boolean;
  rating: number | null;
  reviewCount: number;
  delivery: { free: boolean; label: string | null; fromCents: number | null; conditional: boolean };
};
const aliases: Record<string, string[]> = {
  pizza: ["pizzas", "pizzaria", "pizzarias"],
  hamburguer: ["hamburgueres", "hamburgueria", "hamburguerias", "burger", "burgers"],
  sushi: ["japones", "japonesa", "japoneses", "oriental"],
  acai: ["acais", "acaiteria", "acaiterias"],
  sorvete: ["sorvetes", "sorveteria", "sorveterias", "picole", "picoles", "gelato"],
  marmita: ["marmitas", "marmitaria", "marmitarias", "marmitex", "refeicoes"],
  pastel: ["pasteis", "pastelaria", "pastelarias", "salgaderia", "salgaderias", "salgados"],
  frango: ["frangos", "frangaria", "frango-assado"],
  churrasco: ["churrascaria", "churrascarias"],
  saudavel: ["saudaveis", "fitness", "vegano", "vegetariano", "saladas"],
  mexicana: ["mexicano", "mexicanos", "tacos", "burritos"],
  massas: ["massa", "italiana", "italiano", "macarrao"],
  padaria: ["padarias", "panificadora", "panificadoras", "pao", "paes"],
  lanches: ["lanche", "lanchonete", "lanchonetes", "sanduiche", "sanduiches", "fast-food"],
  doces: ["doce", "doceria", "docerias", "confeitaria", "confeitarias", "bolos"],
  chocolates: ["chocolate", "chocolateria"],
  bebidas: [
    "bebida",
    "distribuidora",
    "distribuidoras",
    "adega",
    "adegas",
    "refrigerantes",
    "cervejas",
  ],
  cafeteria: ["cafeterias", "cafe", "cafes", "coffee"],
  porcoes: ["porcao", "petiscos", "bar", "bares"],
  mercado: [
    "mercados",
    "supermercado",
    "supermercados",
    "mercearia",
    "mercearias",
    "secos-e-molhados",
  ],
  farmacia: ["farmacias", "drogaria", "drogarias", "medicamentos"],
  restaurante: ["restaurantes", "comida", "almoco", "jantar"],
  floricultura: ["floriculturas", "flores", "buques", "florista"],
  petshop: ["pet-shop", "pet-shops", "petshops", "racao", "racoes", "animais"],
  hortifruti: ["hortifrutis", "sacolao", "sacoloes", "verduras", "frutas", "legumes"],
  acougue: ["acougues", "carnes", "casa-de-carnes"],
  peixaria: ["peixarias", "peixes", "frutos-do-mar"],
  conveniencia: ["conveniencias", "loja-de-conveniencia"],
  cosmeticos: ["cosmetico", "cosmeticos-e-perfumaria", "perfumaria", "perfumes", "beleza"],
  presentes: ["presente", "cestas", "lembrancas"],
  encomendas: [
    "despacho",
    "despachos",
    "encomenda",
    "despachos-e-encomendas",
    "documentos",
    "coleta",
  ],
};
const normalize = (value?: string | null) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const artworkAliases = new Map(
  Object.entries(aliases).flatMap(([key, names]) => [key, ...names].map((name) => [name, key])),
);
export function categoryArtworkKey(slug?: string | null, name?: string | null): string {
  return artworkAliases.get(normalize(slug)) ?? artworkAliases.get(normalize(name)) ?? "neutral";
}
export function isCurrentCoupon(coupon: CatalogCoupon, now = new Date()): boolean {
  const time = now.getTime();
  return (
    coupon.ativo &&
    (coupon.starts_at === null || Date.parse(coupon.starts_at) <= time) &&
    (coupon.expires_at === null || Date.parse(coupon.expires_at) > time) &&
    (coupon.usage_limit === null || coupon.used_count < coupon.usage_limit) &&
    (coupon.type === "free_delivery" ||
      (coupon.type === "percent" && coupon.percent > 0) ||
      (coupon.type === "fixed" && coupon.value_cents > 0))
  );
}
export function isProductPromotion(product: CatalogProduct): boolean {
  return (
    product.disponivel &&
    (product.estoque === null || product.estoque > 0) &&
    product.preco_promo_cents !== null &&
    product.preco_promo_cents > 0 &&
    product.preco_promo_cents < product.preco_cents
  );
}
export function catalogStoreFacts(
  store: { taxa_entrega_cents: number; avaliacao: number | null },
  signals: {
    products: CatalogProduct[];
    coupons: CatalogCoupon[];
    zones: CatalogZone[] | null;
    reviewCount: number;
    onlineEnabled: boolean;
    now?: Date;
  },
): CatalogFacts {
  const zones = signals.zones?.filter((zone) => zone.ativo);
  const conditional = Boolean(zones?.length);
  const fee =
    signals.zones === null
      ? null
      : zones?.length
        ? Math.min(...zones.map((zone) => zone.taxa_cents))
        : store.taxa_entrega_cents;
  const free = fee === 0;
  const rating = Number(store.avaliacao);
  return {
    promotion: signals.products.some(isProductPromotion),
    discount: signals.coupons.some((coupon) => isCurrentCoupon(coupon, signals.now)),
    online: signals.onlineEnabled === true,
    rating:
      signals.reviewCount > 0 &&
      store.avaliacao !== null &&
      Number.isFinite(rating) &&
      rating >= 0 &&
      rating <= 5
        ? rating
        : null,
    reviewCount: signals.reviewCount,
    delivery: {
      free,
      conditional,
      fromCents: fee,
      label: free ? (conditional ? "Frete grátis em áreas selecionadas" : "Frete grátis") : null,
    },
  };
}
export function emptyCatalogFilters(): CatalogFilters {
  return { freeDelivery: false, promotion: false, discount: false, online: false, rating: false };
}
export function matchesCatalogFilters(facts: CatalogFacts, filters: CatalogFilters): boolean {
  return (
    (!filters.freeDelivery || facts.delivery.free) &&
    (!filters.promotion || facts.promotion) &&
    (!filters.discount || facts.discount) &&
    (!filters.online || facts.online) &&
    (!filters.rating || (facts.rating !== null && facts.rating >= 4))
  );
}
export async function readCatalogPages<T>(
  read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const all: T[] = [];
  const size = 250;
  for (let from = 0; ; from += size) {
    const { data, error } = await read(from, from + size - 1);
    if (error) throw error;
    const page = data ?? [];
    all.push(...page);
    if (page.length < size) return all;
  }
}
