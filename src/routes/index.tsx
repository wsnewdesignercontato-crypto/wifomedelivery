import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Store,
  Bike,
  ShoppingBag,
  Clock,
  MapPin,
  Shield,
  Star,
  Zap,
  ArrowRight,
} from "lucide-react";
import { IFomeLogo } from "@/components/ifome-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

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

const categorias = [
  { emoji: "🍕", nome: "Pizza" },
  { emoji: "🍔", nome: "Hambúrguer" },
  { emoji: "🍱", nome: "Marmita" },
  { emoji: "🍧", nome: "Açaí" },
  { emoji: "🍨", nome: "Sorvete" },
  { emoji: "🥟", nome: "Pastel" },
  { emoji: "🥪", nome: "Lanches" },
  { emoji: "🥤", nome: "Bebidas" },
  { emoji: "🛒", nome: "Mercado" },
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
    descricao: "Cadastre seu cardápio, receba pedidos e gerencie sua operação no painel.",
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

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <IFomeLogo size="md" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/auth" search={{ perfil: "cliente" }}>
              <Button variant="ghost" className="hidden sm:inline-flex">
                Entrar
              </Button>
            </Link>
            <Link to="/auth" search={{ perfil: "cliente" }}>
              <Button className="bg-gradient-brand text-primary-foreground shadow-brand hover:opacity-95">
                Começar
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(60% 40% at 50% 0%, oklch(0.85 0.15 60 / 0.35) 0%, transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-20 sm:pt-24 sm:pb-28 text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
            <Zap className="h-3.5 w-3.5 text-primary" />
            Delivery em tempo real com rastreamento ao vivo
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl sm:text-6xl font-black tracking-tight text-foreground">
            Sua fome tem{" "}
            <span className="bg-gradient-brand bg-clip-text text-transparent">
              endereço certo
            </span>
            .
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base sm:text-lg text-muted-foreground">
            Peça em minutos dos melhores restaurantes da sua região, acompanhe a entrega
            no mapa e receba tudo quentinho na sua porta.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/auth" search={{ perfil: "cliente" }}>
              <Button
                size="lg"
                className="bg-gradient-brand text-primary-foreground shadow-brand hover:opacity-95 w-full sm:w-auto"
              >
                Peça agora
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/auth" search={{ perfil: "estabelecimento" }}>
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Sou um restaurante
              </Button>
            </Link>
          </div>

          {/* Trust bar */}
          <div className="mx-auto mt-12 grid max-w-2xl grid-cols-3 gap-4 text-center">
            {[
              { Icon: Clock, label: "Entrega em ~30min" },
              { Icon: MapPin, label: "Mapa ao vivo" },
              { Icon: Shield, label: "Pagamento seguro" },
            ].map(({ Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categorias */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              O que vai chegar hoje?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Explore categorias e encontre seu próximo pedido.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {categorias.map((c) => (
            <div
              key={c.nome}
              className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-brand"
            >
              <span className="text-3xl transition-transform group-hover:scale-110">
                {c.emoji}
              </span>
              <span className="text-xs font-medium text-foreground">{c.nome}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 3 perfis */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Uma plataforma, três experiências
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
            WiFome conecta clientes, estabelecimentos e entregadores em tempo real. Escolha
            como quer usar.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {perfis.map(({ key, titulo, descricao, Icon, to, search }) => (
            <Link
              key={key}
              to={to}
              search={search}
              className="group relative flex flex-col rounded-3xl border border-border bg-card p-6 shadow-card transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-brand"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-brand text-primary-foreground shadow-brand">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground">{titulo}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{descricao}</p>
              <div className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                Começar
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Diferenciais */}
      <section className="border-t border-border/60 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid gap-8 sm:grid-cols-3">
            {[
              {
                Icon: Zap,
                titulo: "Tempo real",
                texto:
                  "Do pedido à entrega, tudo sincronizado sem precisar atualizar a tela.",
              },
              {
                Icon: Star,
                titulo: "Melhores restaurantes",
                texto:
                  "Selecionamos parceiros com boa avaliação para uma experiência premium.",
              },
              {
                Icon: Shield,
                titulo: "Seguro e transparente",
                texto:
                  "Autenticação forte, dados protegidos e cada etapa do pedido auditada.",
              },
            ].map(({ Icon, titulo, texto }) => (
              <div key={titulo} className="flex flex-col">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">{titulo}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 sm:flex-row">
          <IFomeLogo size="sm" />
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} WiFome. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
