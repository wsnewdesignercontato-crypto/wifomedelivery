import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
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
  Percent,
  Wallet,
} from "lucide-react";
import { IFomeLogo } from "@/components/ifome-logo";
import { useRevealOnScroll } from "@/hooks/use-reveal-on-scroll";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import heroFood from "@/assets/hero-food.jpg";
import phoneApp from "@/assets/phone-app.png.asset.json";
import trackingPhones from "@/assets/tracking-phones.png";
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
      { property: "og:title", content: "WiFome — Delivery em tempo real" },
      {
        property: "og:description",
        content:
          "Peça comida dos restaurantes próximos, acompanhe a entrega ao vivo e ganhe dinheiro entregando com o WiFome.",
      },
      { property: "og:url", content: "https://wifomedelivery.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://wifomedelivery.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          serviceType: "Food delivery",
          provider: { "@type": "Organization", name: "WiFome" },
          areaServed: { "@type": "Country", name: "Brasil" },
          name: "WiFome — Delivery de comida em tempo real",
          description:
            "Aplicativo de delivery que conecta clientes, restaurantes e entregadores com rastreamento em tempo real.",
        }),
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

function CategoriasRail() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-muted/40 via-background to-muted/30 py-20 sm:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/4 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 right-0 h-56 w-56 rounded-full bg-primary/15 blur-3xl"
      />

      <div className="relative mx-auto max-w-7xl px-6">
        {/* Header */}
        <div className="reveal mb-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Categorias em alta
          </span>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            O que vai chegar <span className="text-primary">hoje?</span>
          </h2>
          <p className="mt-3 max-w-lg text-sm text-muted-foreground sm:text-base">
            Do salgado ao doce, do mercado à farmácia — tudo no mesmo app.
          </p>
        </div>
      </div>

      {/* Marquee wrapper — largura total com fades laterais */}
      <div className="relative">
        {/* Edge fades */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent sm:w-24"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent sm:w-24"
        />

        <div className="marquee-viewport overflow-hidden">
          <div className="marquee-track flex w-max gap-4 py-3 sm:gap-5">

            {[...categorias, ...categorias].map((c, i) => (
              <Link
                key={`${c.nome}-${i}`}
                to="/auth"
                search={{ perfil: "cliente" }}
                className="group relative flex w-[140px] shrink-0 flex-col items-center justify-between overflow-hidden rounded-[1.75rem] border border-border/50 bg-gradient-to-b from-card to-card/70 p-4 shadow-[0_1px_0_0_hsl(0_0%_100%/0.9)_inset,0_10px_30px_-16px_oklch(0_0_0/0.18)] backdrop-blur-sm transition-all duration-500 ease-out hover:-translate-y-1.5 hover:border-primary/50 sm:w-[152px] lg:w-[164px]"
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = `0 1px 0 0 hsl(0 0% 100% / 0.9) inset, 0 24px 48px -22px ${c.glow}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "";
                }}
              >
                {/* soft top tint wash */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-2/3 opacity-70 transition-opacity duration-500 group-hover:opacity-100"
                  style={{
                    background: `radial-gradient(120% 100% at 50% 0%, ${c.tint} 0%, transparent 72%)`,
                  }}
                />

                {/* Icon */}
                <div className="relative mt-1 flex h-24 w-24 items-center justify-center">
                  <div
                    aria-hidden
                    className="absolute inset-2 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                    style={{ background: c.glow }}
                  />
                  <img
                    src={c.img}
                    alt={`Categoria de ${c.nome}`}
                    loading="lazy"
                    width={512}
                    height={512}
                    className="relative h-full w-full object-contain drop-shadow-[0_10px_16px_rgba(0,0,0,0.15)] transition-transform duration-500 ease-out group-hover:-translate-y-1 group-hover:scale-[1.08]"
                  />
                </div>

                {/* Label */}
                <div className="relative mt-3 flex flex-col items-center gap-1.5">
                  <span className="text-[14px] font-bold leading-none tracking-tight text-foreground transition-colors duration-300 group-hover:text-primary">
                    {c.nome}
                  </span>
                  <span
                    aria-hidden
                    className="h-[2px] w-4 rounded-full bg-primary/0 transition-all duration-500 group-hover:w-7 group-hover:bg-primary"
                  />
                </div>

                {/* Shine */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent transition-transform duration-[1200ms] ease-out group-hover:translate-x-full"
                />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

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
            <h1 className="reveal text-5xl font-black leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              Sua fome
              <br />
              tem{" "}
              <span className="bg-gradient-brand bg-clip-text text-transparent">
                endereço
              </span>
              <br />
              certo.
            </h1>
            <p className="reveal mt-6 max-w-md text-base text-white/70 sm:text-lg" style={{ ["--reveal-delay" as never]: "120ms" } as React.CSSProperties}>
              Peça em minutos dos melhores restaurantes da sua região, acompanhe a entrega
              no mapa e receba tudo quentinho na sua porta.
            </p>

            <div className="reveal mt-8 flex flex-col gap-3 sm:flex-row" style={{ ["--reveal-delay" as never]: "220ms" } as React.CSSProperties}>
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
              ].map(({ Icon, label }, i) => (
                <div
                  key={label}
                  className="reveal flex flex-col items-center gap-2 text-center"
                  style={{ ["--reveal-delay" as never]: `${320 + i * 100}ms` } as React.CSSProperties}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary ring-1 ring-primary/40">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <span className="text-xs text-white/70">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Phone mockup */}
          <div className="reveal relative flex justify-center lg:justify-end" style={{ ["--reveal-delay" as never]: "180ms" } as React.CSSProperties}>
            <div
              className="animate-glow-pulse pointer-events-none absolute inset-0 mx-auto h-full w-[80%] rounded-full opacity-60 blur-3xl"
              style={{ background: "radial-gradient(closest-side, #FF6B00, transparent)" }}
            />
            <img
              src={phoneApp.url}
              alt="Aplicativo WiFome"
              width={480}
              height={880}
              className="animate-float-phone relative w-[280px] drop-shadow-2xl sm:w-[340px] lg:w-[400px]"
            />
          </div>
        </div>
      </section>

      {/* ============= CATEGORIAS (PREMIUM RAIL) ============= */}
      <CategoriasRail />



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
          <div className="reveal mx-auto max-w-2xl text-center">
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
                className="reveal group relative flex flex-col overflow-hidden rounded-[2rem] border border-border/60 bg-card p-7 shadow-[0_20px_50px_-20px_oklch(0_0_0/0.15)] transition-all duration-500 hover:-translate-y-2 hover:border-primary/40 hover:shadow-[0_40px_80px_-24px_oklch(0.72_0.19_45/0.35)] sm:p-8"
                style={{ ["--reveal-delay" as never]: `${i * 140}ms` } as React.CSSProperties}
              >
                {/* corner index */}
                <span className="pointer-events-none absolute right-6 top-6 z-10 font-mono text-xs tabular-nums text-muted-foreground/50">
                  0{i + 1}
                </span>

                {/* mockup — floating, sem moldura quadrada */}
                <div className="relative mb-6 flex aspect-[4/3] items-center justify-center">
                  {/* radial wash suave (sem borda visível) */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(60% 55% at 50% 55%, oklch(0.94 0.08 50 / 0.55) 0%, oklch(0.97 0.04 55 / 0.25) 45%, transparent 72%)",
                    }}
                  />
                  {/* glow pulsante atrás do device */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/25 blur-3xl transition-opacity duration-500 group-hover:bg-primary/40"
                  />
                  {/* sombra de contato (elipse sob o device) */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute bottom-2 left-1/2 h-4 w-2/3 -translate-x-1/2 rounded-[50%] bg-black/20 blur-xl"
                  />
                  <img
                    src={mockup}
                    alt=""
                    loading="lazy"
                    width={1024}
                    height={768}
                    className="relative z-10 h-full w-full object-contain drop-shadow-[0_25px_35px_oklch(0_0_0/0.22)] transition-all duration-700 group-hover:-translate-y-1 group-hover:scale-[1.04]"
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
                <div className="mt-6 flex justify-center">
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



      {/* ============= TAXA PREMIUM (DESTAQUE PARCEIROS) ============= */}
      <section
        id="estabelecimentos"
        className="relative overflow-hidden bg-gradient-to-br from-[#0d0705] via-black to-[#0d0705] py-20 sm:py-28"
      >
        {/* Glow orbe laranja */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 top-1/2 h-[520px] w-[520px] -translate-y-1/2 rounded-full bg-primary/20 blur-[140px] animate-glow-pulse"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 bottom-0 h-[420px] w-[420px] rounded-full bg-primary/15 blur-[120px] animate-glow-pulse"
          style={{ animationDelay: "2s" }}
        />

        <div className="relative mx-auto max-w-5xl px-6">
          <div className="reveal mx-auto max-w-3xl rounded-[2.5rem] border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/[0.07] to-transparent p-8 text-center shadow-[0_0_60px_-20px_rgba(255,107,0,0.35)] backdrop-blur-sm sm:p-12 lg:p-16">
            {/* badge */}
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
              <Percent className="h-3.5 w-3.5" />
              Para estabelecimentos
            </span>

            <h2 className="mt-6 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
              A melhor taxa do{" "}
              <span className="bg-gradient-brand bg-clip-text text-transparent">Brasil</span>
            </h2>

            <p className="reveal mx-auto mt-5 max-w-xl text-lg font-medium leading-relaxed text-white/85 sm:text-xl" style={{ ["--reveal-delay" as never]: "120ms" } as React.CSSProperties}>
              Receba no <span className="text-primary font-black">D1</span>, o dia depois, com a
              melhor taxa do Brasil. Mais lucro no seu bolso, menos burocracia.
            </p>

            <div className="reveal mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row" style={{ ["--reveal-delay" as never]: "220ms" } as React.CSSProperties}>
              <Link to="/auth" search={{ perfil: "estabelecimento" }}>
                <Button
                  size="lg"
                  className="bg-gradient-brand text-primary-foreground shadow-brand hover:opacity-95"
                >
                  Cadastrar meu restaurante
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </Link>
            </div>

            <div className="reveal mt-8 flex items-center justify-center gap-2 text-sm text-white/60" style={{ ["--reveal-delay" as never]: "320ms" } as React.CSSProperties}>
              <Wallet className="h-4 w-4 text-primary" />
              <span>Sem mensalidade · Sem surpresas · Saque automático</span>
            </div>
          </div>
        </div>
      </section>



      {/* ============= TRACKING (PREMIUM FLOATING) ============= */}
      <section className="relative overflow-hidden bg-gradient-to-b from-background via-[oklch(0.99_0.01_60)] to-background py-20 sm:py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/4 top-1/2 h-[520px] w-[520px] -translate-y-1/2 rounded-full bg-primary/12 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-6 lg:grid-cols-2">
          <div className="reveal relative order-2 flex justify-center lg:order-1">
            {/* radial wash */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(55% 55% at 50% 55%, oklch(0.94 0.09 50 / 0.55) 0%, oklch(0.97 0.04 55 / 0.2) 45%, transparent 72%)",
              }}
            />
            {/* glow */}
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/25 blur-3xl"
            />
            {/* contact shadow */}
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-6 left-1/2 h-6 w-3/4 -translate-x-1/2 rounded-[50%] bg-black/25 blur-2xl"
            />
            <img
              src={trackingPhones}
              alt="Rastreamento em tempo real do pedido"
              loading="lazy"
              width={1408}
              height={1008}
              className="relative z-10 w-full max-w-2xl object-contain drop-shadow-[0_35px_45px_oklch(0_0_0/0.28)]"
            />
          </div>

          <div className="order-1 lg:order-2 lg:pl-8">
            <p className="reveal text-xs font-bold uppercase tracking-[0.2em] text-primary">
              Acompanhe tudo
            </p>
            <h2 className="reveal mt-3 text-4xl font-black leading-tight tracking-tight text-foreground sm:text-5xl" style={{ ["--reveal-delay" as never]: "100ms" } as React.CSSProperties}>
              Do pedido até
              <br />a sua porta, em{" "}
              <span className="text-primary">tempo real.</span>
            </h2>
            <ul className="mt-8 space-y-4">
              {trackingFeatures.map((f, i) => (
                <li
                  key={f}
                  className="reveal flex items-start gap-3"
                  style={{ ["--reveal-delay" as never]: `${200 + i * 90}ms` } as React.CSSProperties}
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  <span className="text-base text-foreground">{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Em breve nos aplicativos
              </p>
              <div className="mt-3 flex flex-row items-center justify-center gap-2">
                <StoreBadge store="apple" />
                <StoreBadge store="google" />
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ============= DARK BENEFITS BAR (preto + neon laranja) ============= */}
      <section className="relative overflow-hidden bg-black py-20 sm:py-28">
        {/* Grade sutil de neon */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,107,0,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,107,0,0.15) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />

        {/* Orbes de luz neon pulsantes */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 top-0 h-[420px] w-[420px] rounded-full bg-primary/25 blur-[140px] animate-glow-pulse"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 bottom-0 h-[460px] w-[460px] rounded-full bg-primary/20 blur-[160px] animate-glow-pulse"
          style={{ animationDelay: "3s" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[300px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[120px] animate-glow-pulse"
          style={{ animationDelay: "1.5s" }}
        />

        {/* Barra de neon horizontal */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-1/2 h-px -translate-y-1/2"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,107,0,0.35) 20%, rgba(255,107,0,0.55) 50%, rgba(255,107,0,0.35) 80%, transparent 100%)",
            boxShadow: "0 0 40px 2px rgba(255,107,0,0.25), 0 0 80px 8px rgba(255,107,0,0.12)",
          }}
        />

        <div className="relative mx-auto max-w-5xl px-6">
          <div className="reveal mb-12 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Por que o WiFome
            </span>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
              Feito pra você <span className="text-primary">amar</span>
            </h2>
          </div>

          {/* Grid distribuído — 2 col mobile, 4 col desktop, ícone no topo centralizado */}
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {beneficios.map(({ Icon, titulo, texto }, i) => (
              <div
                key={titulo}
                className="reveal group relative flex flex-col items-center overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-8 text-center transition-all duration-500 hover:-translate-y-1 hover:border-primary/50 hover:bg-white/[0.04] hover:shadow-[0_0_30px_-8px_rgba(255,107,0,0.25)]"
                style={{ ["--reveal-delay" as never]: `${i * 120}ms` } as React.CSSProperties}
              >
                {/* Glow neon no hover */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-20 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-primary/0 blur-3xl transition-all duration-500 group-hover:bg-primary/30"
                />

                {/* Ícone centralizado no topo */}
                <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-primary/40 bg-primary/5 text-primary transition-all duration-500 group-hover:border-primary group-hover:bg-primary/15 group-hover:shadow-[0_0_20px_-2px_rgba(255,107,0,0.55)]">
                  <Icon className="h-6 w-6" strokeWidth={1.5} />
                </div>

                <h3 className="relative mt-5 text-base font-semibold tracking-tight text-white sm:text-lg">
                  {titulo}
                </h3>
                <p className="relative mt-2 text-sm leading-relaxed text-white/60">
                  {texto}
                </p>
              </div>
            ))}
          </div>

        </div>
      </section>




      {/* ============= FOOTER (ORANGE) ============= */}
      <footer id="ajuda" className="relative overflow-hidden bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-10 px-6 py-14 sm:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 lg:col-span-2">
            <div className="flex justify-center">
              <IFomeLogo size="md" className="[&_span]:text-white" />
            </div>
            <p className="mx-auto mt-4 max-w-xs text-center text-sm text-white/85">
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
            <h4 className="text-sm font-bold uppercase tracking-wider text-white">Em breve</h4>
            <p className="mt-1 text-xs text-white/70">nos aplicativos</p>
            <div className="mt-4 flex flex-row items-center gap-2">
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

function StoreBadge({ store }: { store: "apple" | "google"; dark?: boolean }) {
  const isApple = store === "apple";
  return (
    <a
      href="#"
      aria-label={isApple ? "Baixar na App Store" : "Baixar no Google Play"}
      className="group inline-flex h-11 items-center gap-2.5 rounded-xl bg-black px-4 text-white shadow-[0_6px_16px_-6px_rgba(0,0,0,0.35)] ring-1 ring-white/10 transition-transform duration-300 hover:-translate-y-0.5"
    >
      {isApple ? (
        <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 fill-white" aria-hidden>
          <path d="M16.365 1.43c0 1.14-.45 2.24-1.19 3.03-.79.85-2.08 1.5-3.14 1.42-.13-1.11.44-2.28 1.15-3.02.79-.83 2.13-1.44 3.18-1.43zM20.5 17.05c-.55 1.27-.82 1.84-1.53 2.96-1 1.56-2.41 3.51-4.16 3.53-1.56.01-1.96-1.01-4.07-1-2.12.01-2.56 1.02-4.11 1.01-1.75-.02-3.09-1.78-4.09-3.34C-.28 15.83-.66 10.7 1.02 8.02 2.2 6.12 4.07 5 5.83 5c1.79 0 2.92 1.03 4.4 1.03 1.44 0 2.32-1.03 4.39-1.03 1.57 0 3.23.86 4.42 2.34-3.88 2.13-3.25 7.68 1.46 9.71z"/>
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden>
          <path d="M3.6 1.7C3.23 2.09 3 2.7 3 3.5v17c0 .8.23 1.41.6 1.8L13.3 12.6 3.6 1.7z" fill="#00D2FF"/>
          <path d="M17.1 8.8 13.3 12.6l3.8 3.8 4.6-2.6c1.3-.74 1.3-2.34 0-3.08L17.1 8.8z" fill="#FFCE00"/>
          <path d="M3.6 22.3c.42.44 1.11.5 1.9.05l12-6.85-3.8-3.8-10.1 10.6z" fill="#FF3D48"/>
          <path d="M17.5 8.6 5.5 1.75c-.79-.45-1.48-.4-1.9.05l9.7 10.8 4.2-4z" fill="#00F076"/>
        </svg>
      )}
      <span className="flex flex-col items-start justify-center leading-none whitespace-nowrap">
        <span className="text-[9px] font-medium uppercase tracking-wide text-white/80">
          {isApple ? "Download on the" : "Get it on"}
        </span>
        <span className="mt-1 text-sm font-semibold leading-none tracking-tight">
          {isApple ? "App Store" : "Google Play"}
        </span>
      </span>

    </a>
  );
}


