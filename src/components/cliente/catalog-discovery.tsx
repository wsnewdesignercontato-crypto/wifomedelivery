import type { LucideIcon } from "lucide-react";
import {
  Beef,
  Bike,
  CakeSlice,
  Candy,
  Coffee,
  CreditCard,
  Drumstick,
  Fish,
  Flower2,
  Gift,
  IceCreamBowl,
  Leaf,
  Package,
  PawPrint,
  Pill,
  Pizza,
  Salad,
  Sandwich,
  ShoppingBasket,
  Soup,
  Sparkles,
  Star,
  Tag,
  UtensilsCrossed,
  Wheat,
  Wine,
} from "lucide-react";
import { categoryArtworkKey, type CatalogFacts, type CatalogFilters } from "@/lib/customer-catalog";
import catPizza from "@/assets/cat-pizza.jpg";
import catHamburguer from "@/assets/cat-hamburguer.jpg";
import catSushi from "@/assets/cat-sushi.jpg";
import catAcai from "@/assets/cat-acai.jpg";
import catSorvete from "@/assets/cat-sorvete.jpg";
import catMarmita from "@/assets/cat-marmita.jpg";
import catPastel from "@/assets/cat-pastel.jpg";
import catFrango from "@/assets/cat-frango.jpg";
import catChurrasco from "@/assets/cat-churrasco.jpg";
import catSaudavel from "@/assets/cat-saudavel.jpg";
import catMexicana from "@/assets/cat-mexicana.jpg";
import catMassas from "@/assets/cat-massas.jpg";
import catPadaria from "@/assets/cat-padaria.jpg";
import catLanches from "@/assets/cat-lanches.jpg";
import catDoces from "@/assets/cat-doces.jpg";
import catChocolates from "@/assets/cat-chocolates.jpg";
import catBebidas from "@/assets/cat-bebidas.jpg";
import catCafeteria from "@/assets/cat-cafeteria.jpg";
import catPorcoes from "@/assets/cat-porcoes.jpg";
import catMercado from "@/assets/cat-mercado.jpg";
import catFarmacia from "@/assets/cat-farmacia.jpg";
import neutralFood from "@/assets/hero-food.jpg";
const photos: Record<string, string> = {
  pizza: catPizza,
  hamburguer: catHamburguer,
  sushi: catSushi,
  acai: catAcai,
  sorvete: catSorvete,
  marmita: catMarmita,
  pastel: catPastel,
  frango: catFrango,
  churrasco: catChurrasco,
  saudavel: catSaudavel,
  mexicana: catMexicana,
  massas: catMassas,
  padaria: catPadaria,
  lanches: catLanches,
  doces: catDoces,
  chocolates: catChocolates,
  bebidas: catBebidas,
  cafeteria: catCafeteria,
  porcoes: catPorcoes,
  mercado: catMercado,
  farmacia: catFarmacia,
  restaurante: catMarmita,
  hortifruti: catSaudavel,
  acougue: catChurrasco,
  peixaria: catSushi,
  conveniencia: catMercado,
  neutral: neutralFood,
};
const illustrations: Record<string, { icon: LucideIcon; color: string }> = {
  pizza: { icon: Pizza, color: "from-orange-100 to-amber-200 text-orange-700" },
  hamburguer: { icon: Sandwich, color: "from-amber-100 to-orange-200 text-amber-800" },
  sushi: { icon: Fish, color: "from-rose-100 to-orange-100 text-rose-700" },
  acai: { icon: IceCreamBowl, color: "from-violet-100 to-fuchsia-200 text-violet-700" },
  sorvete: { icon: IceCreamBowl, color: "from-pink-100 to-rose-200 text-pink-700" },
  marmita: { icon: Soup, color: "from-orange-100 to-amber-200 text-orange-700" },
  pastel: { icon: Wheat, color: "from-amber-100 to-yellow-200 text-amber-800" },
  frango: { icon: Drumstick, color: "from-amber-100 to-orange-200 text-orange-800" },
  churrasco: { icon: Beef, color: "from-rose-100 to-orange-200 text-rose-800" },
  saudavel: { icon: Salad, color: "from-lime-100 to-emerald-200 text-emerald-800" },
  mexicana: { icon: UtensilsCrossed, color: "from-orange-100 to-red-200 text-red-800" },
  massas: { icon: UtensilsCrossed, color: "from-amber-100 to-orange-200 text-orange-800" },
  padaria: { icon: Wheat, color: "from-amber-100 to-yellow-200 text-amber-800" },
  lanches: { icon: Sandwich, color: "from-amber-100 to-orange-200 text-amber-800" },
  doces: { icon: CakeSlice, color: "from-pink-100 to-fuchsia-200 text-pink-800" },
  chocolates: { icon: Candy, color: "from-orange-100 to-amber-200 text-amber-900" },
  bebidas: { icon: Wine, color: "from-sky-100 to-blue-200 text-blue-800" },
  cafeteria: { icon: Coffee, color: "from-orange-100 to-amber-200 text-amber-900" },
  porcoes: { icon: UtensilsCrossed, color: "from-yellow-100 to-orange-200 text-orange-800" },
  mercado: { icon: ShoppingBasket, color: "from-emerald-100 to-lime-200 text-emerald-800" },
  farmacia: { icon: Pill, color: "from-sky-100 to-cyan-200 text-cyan-800" },
  restaurante: { icon: UtensilsCrossed, color: "from-amber-100 to-orange-200 text-orange-800" },
  floricultura: { icon: Flower2, color: "from-pink-100 to-rose-200 text-rose-600" },
  petshop: { icon: PawPrint, color: "from-amber-100 to-orange-200 text-orange-700" },
  hortifruti: { icon: Leaf, color: "from-lime-100 to-emerald-200 text-emerald-800" },
  acougue: { icon: Beef, color: "from-rose-100 to-red-200 text-rose-800" },
  peixaria: { icon: Fish, color: "from-sky-100 to-cyan-200 text-cyan-800" },
  conveniencia: { icon: ShoppingBasket, color: "from-emerald-100 to-lime-200 text-emerald-800" },
  cosmeticos: { icon: Sparkles, color: "from-fuchsia-100 to-violet-200 text-violet-700" },
  presentes: { icon: Gift, color: "from-red-100 to-rose-200 text-red-600" },
  encomendas: { icon: Package, color: "from-amber-100 to-orange-200 text-amber-800" },
  neutral: { icon: UtensilsCrossed, color: "from-orange-100 to-amber-200 text-orange-800" },
};
export function CategoryArtwork({ slug, name }: { slug: string; name: string }) {
  const key = categoryArtworkKey(slug, name);
  const photo = photos[key];
  const { icon: Icon, color } = illustrations[key] ?? illustrations.neutral;
  return (
    <div
      role="img"
      aria-label={name}
      className={`relative grid h-full w-full place-items-center overflow-hidden bg-gradient-to-br ${color}`}
    >
      <span
        className="absolute -right-2 -top-2 h-10 w-10 rounded-full bg-white/35"
        aria-hidden="true"
      />
      <Icon
        className="h-9 w-9 drop-shadow-sm sm:h-10 sm:w-10"
        strokeWidth={1.7}
        aria-hidden="true"
      />
      {photo && (
        <img
          key={photo}
          src={photo}
          alt=""
          width={192}
          height={192}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
    </div>
  );
}
const filterOptions: {
  key: keyof CatalogFilters;
  label: string;
  icon: LucideIcon;
  title: string;
}[] = [
  {
    key: "freeDelivery",
    label: "Frete grátis",
    icon: Bike,
    title: "Lojas com entrega gratuita; consulte as áreas atendidas",
  },
  {
    key: "promotion",
    label: "Promoções",
    icon: Tag,
    title: "Produtos disponíveis com preço promocional menor",
  },
  {
    key: "discount",
    label: "Com desconto",
    icon: Sparkles,
    title: "Lojas com cupom válido; consulte as condições e o pedido mínimo",
  },
  {
    key: "online",
    label: "Pagamento online",
    icon: CreditCard,
    title: "Pix ou cartão pelo aplicativo",
  },
  {
    key: "rating",
    label: "Avaliação 4+",
    icon: Star,
    title: "Nota a partir de 4, com avaliações de clientes",
  },
];
export function CatalogFilterBar({
  filters,
  onChange,
}: {
  filters: CatalogFilters;
  onChange: (filters: CatalogFilters) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filtrar lojas"
      className="flex w-full gap-2 overflow-x-auto pb-3"
      style={{ scrollbarWidth: "thin", scrollbarColor: "var(--primary) var(--muted)" }}
    >
      {filterOptions.map(({ key, label, icon: Icon, title }) => (
        <button
          type="button"
          key={key}
          title={title}
          aria-pressed={filters[key]}
          onClick={() => onChange({ ...filters, [key]: !filters[key] })}
          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${filters[key] ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/50"}`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
export function CatalogBadges({ facts }: { facts: CatalogFacts }) {
  if (!facts.promotion && !facts.discount && !facts.online && !facts.delivery.free) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1 text-[10px] font-semibold">
      {facts.promotion && (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
          <Tag className="h-3 w-3" aria-hidden="true" />
          Promoção
        </span>
      )}
      {facts.discount && (
        <span
          title="Consulte as condições do cupom e o pedido mínimo na loja"
          className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700"
        >
          Cupom disponível
        </span>
      )}
      {facts.online && (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-700">
          <CreditCard className="h-3 w-3" aria-hidden="true" />
          Pagamento online
        </span>
      )}
      {facts.delivery.free && (
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700">
          {facts.delivery.label}
        </span>
      )}
    </div>
  );
}
export function CatalogRating({ facts }: { facts: CatalogFacts }) {
  return facts.rating === null ? (
    <span className="font-semibold text-muted-foreground">Novo</span>
  ) : (
    <span
      className="inline-flex items-center gap-0.5 font-semibold text-foreground"
      aria-label={`${facts.rating.toFixed(1)} de 5, ${facts.reviewCount} avaliações`}
    >
      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" aria-hidden="true" />
      {facts.rating.toFixed(1)}{" "}
      <span className="ml-0.5 font-normal text-muted-foreground">({facts.reviewCount})</span>
    </span>
  );
}
