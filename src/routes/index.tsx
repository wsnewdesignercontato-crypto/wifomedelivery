import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Store,
  Bike,
  ShoppingBag,
  Timer,
  MapPin,
  ShieldCheck,
  Star,
  Ticket,
  Headphones,
  ArrowRight,
  Check,
  Instagram,
  Facebook,
  Twitter,
  Music2,
} from "lucide-react";
import { IFomeLogo } from "@/components/ifome-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import heroFood from "@/assets/hero-food.jpg";
import phoneApp from "@/assets/phone-app.png.asset.json";
import trackingPhones from "@/assets/tracking-phones.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WiFome — Delivery em tempo real" },
      {
        name: "description",
        content:
          "Peça comida dos seus restaurantes favoritos, acompanhe a entrega ao vivo e trabalhe como parceiro WiFome. Cliente, estabelecimento e entregador em um único app.",
      },
    ],
  }),
  component: LandingPage,
});

const navLinks = [
  { label: "Início", href: "#inicio" },
  { label: "Como funciona", href: "#como-funciona" },
  { label: "Para estabelecimentos", href: "#estabelecimentos" },
  { label: "Para entregadores", href: "#entregadores" },
  { label: "Ajuda", href: "#ajuda" },
];

const categorias = [
  { emoji: "🍕", nome: "Pizza" },
  { emoji: "🍔", nome: "Hambúrguer" },
  { emoji: "🍲", nome: "Marmita" },
  { emoji: "🍧", nome: "Açaí" },
  { emoji: "🍦", nome: "Sorvete" },
  { emoji: "🥟", nome: "Pastel" },
  { emoji: "🥪", nome: "Lanches" },
  { emoji: "🥤", nome: "Bebidas" },
  { emoji: "🧺", nome: "Mercado" },
  { emoji: "💊", nome: "Farmácia" },
];

const perfis = [
  {
    key: "cliente",
    titulo: "Sou cliente",
    descricao: "Descubra restaurantes, faça pedidos e acompanhe a entrega em tempo real.",
    Icon: ShoppingBag,
    to: "/auth" as const,
    search: { perfil: "cliente" as const },
  },
  {
    key: "estabelecimento",
    titulo: "Tenho um estabelecimento",
    descricao: "Gerencie seu cardápio, receba pedidos e aumente suas vendas no WiFome.",
    Icon: Store,
    to: "/auth" as const,
    search: { perfil: "estabelecimento" as const },
  },
  {
    key: "entregador",
    titulo: "Quero entregar",
    descricao: "Aceite corridas próximas, faça entregas e acompanhe seus ganhos.",
    Icon: Bike,
    to: "/auth" as const,
    search: { perfil: "entregador" as const },
  },
];

const trackingFeatures = [
  "Rastreamento do entregador no mapa",
  "Atualizações em tempo real",
  "Chat direto com restaurante e entregador",
  "Pagamento seguro e protegido",
];

const beneficios = [
  {
    Icon: Timer,
    titulo: "Entrega rápida",
    texto: "Entregas em minutos direto na sua porta.",
  },
  {
    Icon: Star,
    titulo: "Os melhores",
    texto: "Restaurantes e lojas selecionadas para você.",
  },
  {
    Icon: Ticket,
    titulo: "Cupons e promoções",
    texto: "Descontos exclusivos todos os dias.",
  },
  {
    Icon: Headphones,
    titulo: "Suporte 24h",
    texto: "Estamos sempre prontos para te ajudar.",
  },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* ============= HEADER ============= */}
      <header
        id="inicio"
        className="absolute inset-x-0 top-0 z-40 border-b border-white/10 bg-transparent"
      >
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <IFomeLogo size="md" className="[&_span]:text-white" />
          <nav className="hidden items-center gap-8 lg:flex">
            {navLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="text-sm font-medium text-white/80 transition hover:text-white"
              >
                {l.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/auth" search={{ perfil: "cliente" }}>
              <Button
                variant="outline"
                className="hidden border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white sm:inline-flex"
              >
                Entrar
              </Button>
            </Link>
            <Link to="/auth" search={{ perfil: "cliente" }}>
              <Button className="bg-gradient-brand text-primary-foreground shadow-brand hover:opacity-95">
                Cadastrar
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ============= HERO (DARK) ============= */}
      <section className="relative overflow-hidden bg-[#0d0705] pt-20 text-white">
        <img
          src={heroFood}
          alt=""
          aria-hidden
          width={1600}
          height={1200}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-90"
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(13,7,5,0.92) 0%, rgba(13,7,5,0.55) 45%, rgba(13,7,5,0.3) 65%, rgba(13,7,5,0.6) 100%)",
          }}
        />
        <div
          className="pointer-events-none absolute -bottom-32 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(closest-side, #FF6B00, transparent)" }}
        />

        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 px-6 pb-20 pt-16 sm:pb-28 lg:grid-cols-2 lg:pb-32 lg:pt-24">
          {/* Copy */}
          <div className="max-w-xl">
            <h1 className="text-5xl font-black leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              Sua fome
              <br />
              tem{" "}
              <span className="bg-gradient-brand bg-clip-text text-transparent">
                endereço
              </span>
              <br />
              certo.
            </h1>
            <p className="mt-6 max-w-md text-base text-white/70 sm:text-lg">
              Peça em minutos dos melhores restaurantes da sua região, acompanhe a entrega
              no mapa e receba tudo quentinho na sua porta.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/auth" search={{ perfil: "cliente" }}>
                <Button
                  size="lg"
                  className="w-full bg-gradient-brand text-primary-foreground shadow-brand hover:opacity-95 sm:w-auto"
                >
                  Peça agora
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/auth" search={{ perfil: "estabelecimento" }}>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white sm:w-auto"
                >
                  Sou um restaurante
                </Button>
              </Link>
            </div>

            {/* Trust icons */}
            <div className="mt-12 grid max-w-md grid-cols-3 gap-4">
              {[
                { Icon: Timer, label: "Entrega em minutos" },
                { Icon: MapPin, label: "Mapa ao vivo" },
                { Icon: ShieldCheck, label: "Pagamento seguro" },
              ].map(({ Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-2 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary ring-1 ring-primary/40">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <span className="text-xs text-white/70">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Phone mockup */}
          <div className="relative flex justify-center lg:justify-end">
            <div
              className="pointer-events-none absolute inset-0 mx-auto h-full w-[80%] rounded-full opacity-60 blur-3xl"
              style={{ background: "radial-gradient(closest-side, #FF6B00, transparent)" }}
            />
            <img
              src={phoneApp.url}
              alt="Aplicativo WiFome"
              width={480}
              height={880}
              className="relative w-[280px] drop-shadow-2xl sm:w-[340px] lg:w-[400px]"
            />
          </div>
        </div>
      </section>

      {/* ============= CATEGORIAS ============= */}
      <section className="bg-muted/30 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-8 flex items-end justify-between">
            <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
              O que vai chegar hoje?
            </h2>
            <Link
              to="/auth"
              search={{ perfil: "cliente" }}
              className="group inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:opacity-80"
            >
              Ver todas
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-10">
            {categorias.map((c) => (
              <Link
                key={c.nome}
                to="/auth"
                search={{ perfil: "cliente" }}
                className="group flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-card p-3 shadow-card transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-brand"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-background text-4xl transition-transform group-hover:scale-110">
                  {c.emoji}
                </div>
                <span className="text-xs font-semibold text-foreground">{c.nome}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ============= 3 PERFIS ============= */}
      <section id="como-funciona" className="bg-background py-20">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-center text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            Uma plataforma,{" "}
            <span className="text-primary">três experiências</span>
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {perfis.map(({ key, titulo, descricao, Icon, to, search }) => (
              <Link
                key={key}
                to={to}
                search={search}
                className="group relative flex flex-col rounded-3xl border border-border bg-card p-8 shadow-card transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-brand"
              >
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-brand">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-foreground">{titulo}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{descricao}</p>
                <div className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  Começar
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ============= TRACKING (PEACH) ============= */}
      <section className="bg-[oklch(0.96_0.03_55)] py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-6 lg:grid-cols-2">
          <div className="order-2 flex justify-center lg:order-1">
            <img
              src={trackingPhones}
              alt="Rastreamento em tempo real do pedido"
              loading="lazy"
              width={1408}
              height={1008}
              className="w-full max-w-2xl drop-shadow-2xl"
            />
          </div>
          <div className="order-1 lg:order-2 lg:pl-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
              Acompanhe tudo
            </p>
            <h2 className="mt-3 text-4xl font-black leading-tight tracking-tight text-foreground sm:text-5xl">
              Do pedido até
              <br />a sua porta, em{" "}
              <span className="text-primary">tempo real.</span>
            </h2>
            <ul className="mt-8 space-y-4">
              {trackingFeatures.map((f) => (
                <li key={f} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  <span className="text-base text-foreground">{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <StoreBadge store="apple" />
              <StoreBadge store="google" />
            </div>
          </div>
        </div>
      </section>

      {/* ============= DARK BENEFITS BAR ============= */}
      <section className="bg-background py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="rounded-3xl bg-[#151113] p-8 sm:p-10">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {beneficios.map(({ Icon, titulo, texto }) => (
                <div key={titulo} className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <Icon className="h-5.5 w-5.5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">{titulo}</h3>
                    <p className="mt-1 text-sm text-white/60">{texto}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============= FOOTER (ORANGE) ============= */}
      <footer id="ajuda" className="relative overflow-hidden bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-10 px-6 py-14 sm:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 lg:col-span-2">
            <IFomeLogo size="md" className="[&_span]:text-white" />
            <p className="mt-4 max-w-xs text-sm text-white/85">
              Mais que um app de delivery, uma experiência completa para você, restaurantes e
              entregadores.
            </p>
            <div className="mt-6 flex gap-2">
              {[Instagram, Facebook, Twitter, Music2].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/40 text-white transition hover:bg-white/10"
                  aria-label="Rede social"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <FooterCol title="Links rápidos" items={["Início", "Como funciona", "Para estabelecimentos", "Para entregadores", "Ajuda"]} />
          <FooterCol title="Institucional" items={["Sobre nós", "Carreiras", "Blog", "Política de privacidade", "Termos de uso"]} />

          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-white">Baixe o app</h4>
            <div className="mt-4 flex flex-col gap-3">
              <StoreBadge store="apple" dark />
              <StoreBadge store="google" dark />
            </div>
          </div>
        </div>
        <div className="border-t border-white/20">
          <p className="mx-auto max-w-7xl px-6 py-5 text-center text-xs text-white/80">
            © {new Date().getFullYear()} WiFome. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="text-sm font-bold uppercase tracking-wider text-white">{title}</h4>
      <ul className="mt-4 space-y-2.5">
        {items.map((i) => (
          <li key={i}>
            <a href="#" className="text-sm text-white/85 transition hover:text-white">
              {i}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StoreBadge({ store, dark }: { store: "apple" | "google"; dark?: boolean }) {
  const base = dark
    ? "bg-black text-white"
    : "bg-black text-white";
  return (
    <a
      href="#"
      className={`inline-flex items-center gap-2.5 rounded-xl px-4 py-2.5 transition hover:opacity-90 ${base}`}
    >
      <span className="text-xl leading-none">{store === "apple" ? "" : "▶"}</span>
      <span className="flex flex-col leading-tight">
        <span className="text-[9px] uppercase tracking-wide opacity-80">
          {store === "apple" ? "Disponível na" : "Disponível no"}
        </span>
        <span className="text-sm font-bold">
          {store === "apple" ? "App Store" : "Google Play"}
        </span>
      </span>
    </a>
  );
}
