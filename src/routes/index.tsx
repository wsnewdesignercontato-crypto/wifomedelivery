import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef } from "react";
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
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { IFomeLogo } from "@/components/ifome-logo";
import { useRevealOnScroll } from "@/hooks/use-reveal-on-scroll";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import heroFood from "@/assets/hero-food.jpg";
import phoneApp from "@/assets/phone-app.png.asset.json";
import trackingPhones from "@/assets/tracking-phones.jpg";
import perfilCliente from "@/assets/perfil-cliente.png";
import perfilEstabelecimento from "@/assets/perfil-estabelecimento.png";
import perfilEntregador from "@/assets/perfil-entregador.png";


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

import catPizza from "@/assets/cat/pizza.png";
import catHamburguer from "@/assets/cat/hamburguer.png";
import catMarmita from "@/assets/cat/marmita.png";
import catAcai from "@/assets/cat/acai.png";
import catSorvete from "@/assets/cat/sorvete.png";
import catPastel from "@/assets/cat/pastel.png";
import catLanches from "@/assets/cat/lanches.png";
import catBebidas from "@/assets/cat/bebidas.png";
import catMercado from "@/assets/cat/mercado.png";
import catFarmacia from "@/assets/cat/farmacia.png";

const categorias = [
  { img: catPizza,       nome: "Pizza",      tint: "oklch(0.96 0.05 55)",  glow: "oklch(0.72 0.19 45 / 0.35)" },
  { img: catHamburguer,  nome: "Hambúrguer", tint: "oklch(0.96 0.05 80)",  glow: "oklch(0.75 0.16 75 / 0.35)" },
  { img: catMarmita,     nome: "Marmita",    tint: "oklch(0.95 0.05 145)", glow: "oklch(0.7 0.15 145 / 0.3)" },
  { img: catAcai,        nome: "Açaí",       tint: "oklch(0.94 0.05 310)", glow: "oklch(0.6 0.2 310 / 0.35)" },
  { img: catSorvete,     nome: "Sorvete",    tint: "oklch(0.96 0.04 20)",  glow: "oklch(0.75 0.15 15 / 0.3)" },
  { img: catPastel,      nome: "Pastel",     tint: "oklch(0.96 0.05 70)",  glow: "oklch(0.75 0.15 70 / 0.35)" },
  { img: catLanches,     nome: "Lanches",    tint: "oklch(0.95 0.04 230)", glow: "oklch(0.65 0.15 230 / 0.3)" },
  { img: catBebidas,     nome: "Bebidas",    tint: "oklch(0.94 0.06 25)",  glow: "oklch(0.65 0.22 25 / 0.35)" },
  { img: catMercado,     nome: "Mercado",    tint: "oklch(0.95 0.04 265)", glow: "oklch(0.6 0.15 265 / 0.3)" },
  { img: catFarmacia,    nome: "Farmácia",   tint: "oklch(0.95 0.04 350)", glow: "oklch(0.68 0.2 350 / 0.35)" },
];


const perfis = [
  {
    key: "cliente",
    tag: "Sou",
    highlight: "cliente",
    descricao: "Descubra restaurantes, faça pedidos e acompanhe a entrega em tempo real.",
    Icon: ShoppingBag,
    mockup: perfilCliente,
    to: "/auth" as const,
    search: { perfil: "cliente" as const },
  },
  {
    key: "estabelecimento",
    tag: "Tenha um",
    highlight: "estabelecimento",
    descricao: "Gerencie seu cardápio, receba pedidos e aumente suas vendas no WiFome.",
    Icon: Store,
    mockup: perfilEstabelecimento,
    to: "/auth" as const,
    search: { perfil: "estabelecimento" as const },
  },
  {
    key: "entregador",
    tag: "Quero",
    highlight: "entregar",
    descricao: "Aceite corridas próximas, faça entregas e acompanhe seus ganhos.",
    Icon: Bike,
    mockup: perfilEntregador,
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
  useRevealOnScroll();
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

      {/* ============= CATEGORIAS (PREMIUM) ============= */}
      <section className="relative overflow-hidden bg-gradient-to-b from-muted/40 via-background to-muted/30 py-20 sm:py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/4 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-7xl px-6">
          <div className="reveal mb-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                Categorias em alta
              </span>
              <h2 className="mt-4 text-3xl font-black tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                O que vai chegar{" "}
                <span className="text-primary">hoje?</span>
              </h2>
              <p className="mt-3 max-w-lg text-sm text-muted-foreground sm:text-base">
                Do salgado ao doce, do mercado à farmácia — tudo no mesmo app.
              </p>
            </div>
            <Link
              to="/auth"
              search={{ perfil: "cliente" }}
              className="group inline-flex w-fit items-center gap-2 rounded-full border border-border/60 bg-card px-5 py-2.5 text-sm font-bold text-foreground shadow-sm transition-all hover:border-primary hover:bg-primary hover:text-primary-foreground hover:shadow-brand"
            >
              Ver todas
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 sm:gap-4 lg:grid-cols-10 lg:gap-4">
            {categorias.map((c, i) => (
              <Link
                key={c.nome}
                to="/auth"
                search={{ perfil: "cliente" }}
                style={{ ["--reveal-delay" as string]: `${i * 55}ms` }}
                className="reveal group relative flex aspect-[3/4] flex-col items-center justify-between overflow-hidden rounded-[1.5rem] border border-border/50 bg-gradient-to-b from-card to-card/60 p-4 shadow-[0_1px_0_0_hsl(0_0%_100%/0.8)_inset,0_10px_28px_-14px_oklch(0_0_0/0.15)] backdrop-blur-sm transition-all duration-500 ease-out hover:-translate-y-1.5 hover:border-primary/50"
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = `0 1px 0 0 hsl(0 0% 100% / 0.8) inset, 0 24px 44px -20px ${c.glow}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "";
                }}
              >
                {/* soft top tint wash */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-1/2 opacity-60 transition-opacity duration-500 group-hover:opacity-100"
                  style={{
                    background: `radial-gradient(120% 100% at 50% 0%, ${c.tint} 0%, transparent 70%)`,
                  }}
                />

                {/* index */}
                <span className="absolute right-3 top-3 font-mono text-[10px] font-medium tabular-nums tracking-widest text-muted-foreground/45">
                  {String(i + 1).padStart(2, "0")}
                </span>

                {/* icon orb */}
                <div className="float-on-hover relative mt-2">
                  <div
                    aria-hidden
                    className="absolute inset-0 -m-3 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                    style={{ background: c.glow }}
                  />
                  <div
                    className="pulse-ring-on-hover relative flex h-16 w-16 items-center justify-center rounded-[1.25rem] text-[2rem] transition-all duration-500 ease-out group-hover:scale-110 group-hover:-rotate-[8deg]"
                    style={{
                      background: `linear-gradient(160deg, color-mix(in oklab, ${c.tint} 88%, white) 0%, ${c.tint} 100%)`,
                      boxShadow: `inset 0 1px 0 0 hsl(0 0% 100% / 0.9), inset 0 -6px 12px -6px ${c.glow}, 0 6px 16px -8px ${c.glow}`,
                      color: c.glow,
                    }}
                  >
                    <span className="drop-shadow-[0_2px_3px_rgba(0,0,0,0.12)] transition-transform duration-500 group-hover:scale-110">
                      {c.emoji}
                    </span>
                  </div>
                </div>

                {/* label */}
                <div className="relative flex flex-col items-center gap-1.5">
                  <span className="text-[13px] font-bold leading-none tracking-tight text-foreground transition-colors duration-300 group-hover:text-primary">
                    {c.nome}
                  </span>
                  <span
                    aria-hidden
                    className="h-[2px] w-4 rounded-full bg-primary/0 transition-all duration-500 group-hover:w-6 group-hover:bg-primary"
                  />
                </div>

                {/* shine */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent transition-transform duration-[1200ms] ease-out group-hover:translate-x-full"
                />
              </Link>
            ))}
          </div>
        </div>
      </section>


      {/* ============= 3 PERFIS (PREMIUM HORIZONTAL) ============= */}
      <section
        id="como-funciona"
        className="relative overflow-hidden bg-gradient-to-b from-background via-background to-[oklch(0.98_0.015_60)] py-20 sm:py-28"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[880px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-7xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-1.5 text-[11px] font-black uppercase tracking-[0.22em] text-primary-foreground shadow-[0_10px_24px_-8px_oklch(0.72_0.19_45/0.55)]">
              Uma plataforma, três experiências
            </span>
            <h2 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight text-foreground sm:text-5xl">
              Escolha o seu{" "}
              <span className="text-primary">papel</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
              Pedir, vender ou entregar — o WiFome foi desenhado para você
              começar em minutos e crescer com a gente.
            </p>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-3 lg:gap-7">
            {perfis.map(({ key, tag, highlight, descricao, Icon, mockup, to, search }, i) => (
              <Link
                key={key}
                to={to}
                search={search}
                className="group relative flex flex-col overflow-hidden rounded-[2rem] border border-border/60 bg-card p-7 shadow-[0_20px_50px_-20px_oklch(0_0_0/0.15)] transition-all duration-500 hover:-translate-y-2 hover:border-primary/40 hover:shadow-[0_40px_80px_-24px_oklch(0.72_0.19_45/0.35)] sm:p-8"
              >
                {/* corner index */}
                <span className="pointer-events-none absolute right-6 top-6 z-10 font-mono text-xs tabular-nums text-muted-foreground/50">
                  0{i + 1}
                </span>

                {/* mockup on top */}
                <div className="relative -mx-2 -mt-2 mb-5 aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br from-[oklch(0.98_0.02_55)] to-[oklch(0.95_0.05_45)]">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/15 blur-3xl"
                  />
                  <img
                    src={mockup}
                    alt=""
                    loading="lazy"
                    width={1024}
                    height={768}
                    className="absolute inset-0 h-full w-full object-contain p-3 transition-transform duration-700 group-hover:scale-105"
                  />
                </div>

                {/* icon */}
                <div className="relative mb-4">
                  <div className="absolute -inset-3 rounded-3xl bg-primary/15 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
                  <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.68_0.2_38)] text-primary-foreground shadow-[0_10px_24px_-8px_oklch(0.72_0.19_45/0.6)] transition-transform duration-500 group-hover:scale-110 group-hover:rotate-[-4deg]">
                    <Icon className="h-6 w-6" strokeWidth={2} />
                  </div>
                </div>

                <h3 className="text-2xl font-black leading-tight tracking-tight text-foreground">
                  {tag}{" "}
                  <span className="text-primary">{highlight}</span>
                </h3>
                <p className="mt-2 flex-grow text-[15px] leading-relaxed text-muted-foreground">
                  {descricao}
                </p>

                {/* CTA */}
                <div className="mt-6">
                  <span className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_-8px_oklch(0.72_0.19_45/0.55)] transition-transform duration-300 group-hover:translate-x-1">
                    Começar agora
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </div>

                {/* hover shine */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary/5 to-transparent transition-transform duration-1000 group-hover:translate-x-full"
                />
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
