import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bell,
  ChevronRight,
  Crown,
  FileText,
  Gift,
  Heart,
  HelpCircle,
  Loader2,
  LogOut,
  MapPin,
  Shield,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Star,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/cliente/perfil/")({
  component: PerfilHub,
});

type ProfileMini = {
  nome: string;
  telefone: string | null;
  foto_url: string | null;
};

type ProfileSummary = {
  addressCount: number;
  favoriteCount: number;
  totalOrders: number;
  activeOrders: number;
};

const APP_VERSION = "1.0.0";

const ACTIVE_ORDER_STATUSES = [
  "placed",
  "accepted",
  "preparing",
  "ready",
  "waiting_courier",
  "courier_assigned",
  "picked_up",
  "on_the_way",
  "arriving",
] as const;

const GROUPS: Array<{
  title: string;
  items: Array<{
    to:
      | "/cliente/perfil/conta"
      | "/cliente/perfil/enderecos"
      | "/cliente/perfil/notificacoes"
      | "/cliente/perfil/clube"
      | "/cliente/perfil/recompensas"
      | "/cliente/perfil/dispositivo"
      | "/cliente/perfil/ajuda"
      | "/cliente/perfil/termos";
    label: string;
    desc: string;
    icon: typeof User;
    accent?: boolean;
  }>;
}> = [
  {
    title: "Conta",
    items: [
      {
        to: "/cliente/perfil/conta",
        label: "Minha conta",
        desc: "Nome, telefone, foto e senha",
        icon: User,
      },
      {
        to: "/cliente/perfil/enderecos",
        label: "Enderecos",
        desc: "Casa, trabalho e outros locais",
        icon: MapPin,
      },
    ],
  },
  {
    title: "Vantagens WiFome",
    items: [
      {
        to: "/cliente/perfil/clube",
        label: "Clube WiFome",
        desc: "Assinatura com economia premium",
        icon: Crown,
        accent: true,
      },
      {
        to: "/cliente/perfil/recompensas",
        label: "Recompensas e beneficios",
        desc: "Cupons, cashback e conquistas",
        icon: Gift,
      },
    ],
  },
  {
    title: "Preferencias",
    items: [
      {
        to: "/cliente/perfil/notificacoes",
        label: "Notificacoes",
        desc: "Promocoes, alertas e pedidos",
        icon: Bell,
      },
      {
        to: "/cliente/perfil/dispositivo",
        label: "Configuracoes do dispositivo",
        desc: "Permissoes, som e localizacao",
        icon: Smartphone,
      },
    ],
  },
  {
    title: "Suporte e termos",
    items: [
      {
        to: "/cliente/perfil/ajuda",
        label: "Ajuda e suporte",
        desc: "Central de atendimento WiFome",
        icon: HelpCircle,
      },
      {
        to: "/cliente/perfil/termos",
        label: "Termos e privacidade",
        desc: "Politicas, seguranca e transparencia",
        icon: FileText,
      },
    ],
  },
];

function PerfilHub() {
  const { user } = Route.useRouteContext() as { user: { id: string; email?: string } };
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileMini | null>(null);
  const [summary, setSummary] = useState<ProfileSummary>({
    addressCount: 0,
    favoriteCount: 0,
    totalOrders: 0,
    activeOrders: 0,
  });
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      try {
        const [profileRes, addressesRes, favoritesRes, totalOrdersRes, activeOrdersRes] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("nome,telefone,foto_url")
              .eq("id", user.id)
              .maybeSingle(),
            supabase
              .from("addresses")
              .select("*", { count: "exact", head: true })
              .eq("user_id", user.id),
            supabase
              .from("favorites")
              .select("*", { count: "exact", head: true })
              .eq("user_id", user.id),
            supabase
              .from("orders")
              .select("*", { count: "exact", head: true })
              .eq("cliente_id", user.id),
            supabase
              .from("orders")
              .select("*", { count: "exact", head: true })
              .eq("cliente_id", user.id)
              .in("status", ACTIVE_ORDER_STATUSES),
          ]);

        if (cancelled) return;

        setProfile(
          (profileRes.data as ProfileMini | null) ?? { nome: "", telefone: null, foto_url: null },
        );
        setSummary({
          addressCount: addressesRes.count ?? 0,
          favoriteCount: favoritesRes.count ?? 0,
          totalOrders: totalOrdersRes.count ?? 0,
          activeOrders: activeOrdersRes.count ?? 0,
        });
      } catch {
        if (!cancelled) toast.error("Nao foi possivel carregar seu perfil");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [user.id]);

  async function sair() {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      navigate({ to: "/", replace: true });
    } catch {
      setSigningOut(false);
      toast.error("Erro ao sair");
    }
  }

  const displayName = profile?.nome?.trim() || user.email || "Cliente WiFome";
  const initials = useMemo(
    () =>
      displayName
        .split(" ")
        .map((piece) => piece[0])
        .slice(0, 2)
        .join("")
        .toUpperCase(),
    [displayName],
  );

  const completionItems = useMemo(
    () => [
      { label: "Foto do perfil", ready: Boolean(profile?.foto_url) },
      { label: "Telefone salvo", ready: Boolean(profile?.telefone) },
      { label: "Endereco principal", ready: summary.addressCount > 0 },
      { label: "Primeiro pedido", ready: summary.totalOrders > 0 },
    ],
    [profile?.foto_url, profile?.telefone, summary.addressCount, summary.totalOrders],
  );

  const completionPct = Math.round(
    (completionItems.filter((item) => item.ready).length / completionItems.length) * 100,
  );

  const quickActions = [
    {
      to: "/cliente/perfil/enderecos" as const,
      label: "Enderecos",
      desc: `${summary.addressCount} salvo${summary.addressCount === 1 ? "" : "s"}`,
      icon: MapPin,
    },
    {
      to: "/cliente/favoritos" as const,
      label: "Favoritos",
      desc: `${summary.favoriteCount} loja${summary.favoriteCount === 1 ? "" : "s"} curtida${summary.favoriteCount === 1 ? "" : "s"}`,
      icon: Heart,
    },
    {
      to: "/cliente/pedidos" as const,
      label: "Pedidos ativos",
      desc: `${summary.activeOrders} em andamento`,
      icon: ShoppingBag,
    },
    {
      to: "/cliente/perfil/clube" as const,
      label: "Clube",
      desc: "Economia, frete e beneficios",
      icon: Crown,
    },
  ];

  if (loading && !profile) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      <section className="card-premium relative overflow-hidden border-none bg-gradient-to-br from-primary/12 via-white to-primary/5 p-5 dark:from-primary/15 dark:via-card dark:to-primary/10 sm:p-6">
        <div className="absolute -left-10 top-0 h-36 w-36 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -right-10 bottom-0 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative grid gap-6 xl:grid-cols-[1.1fr_0.9fr] xl:items-start">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary text-primary-foreground">Perfil premium</Badge>
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                Conta protegida
              </Badge>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[1.75rem] bg-primary/10 text-2xl font-black text-primary ring-1 ring-primary/15">
                {profile?.foto_url ? (
                  <img src={profile.foto_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="truncate text-3xl font-black tracking-tight text-foreground">
                  {profile?.nome || "Cliente WiFome"}
                </h1>
                <p className="mt-1 truncate text-sm text-muted-foreground">{user.email}</p>
                {profile?.telefone ? (
                  <p className="mt-1 text-sm text-muted-foreground">{profile.telefone}</p>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Adicione telefone para agilizar pedidos e suporte.
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to="/cliente/perfil/conta">
                    <Button size="sm" className="rounded-full">
                      Editar conta
                    </Button>
                  </Link>
                  <Link to="/cliente/perfil/recompensas">
                    <Button size="sm" variant="outline" className="rounded-full">
                      Ver beneficios
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <HeroMetric
                label="Pedidos no historico"
                value={String(summary.totalOrders)}
                hint="Seu painel de compras"
              />
              <HeroMetric
                label="Favoritos"
                value={String(summary.favoriteCount)}
                hint="Lojas salvas para repetir"
              />
              <HeroMetric
                label="Enderecos"
                value={String(summary.addressCount)}
                hint="Entrega mais rapida no checkout"
              />
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-card backdrop-blur dark:border-border dark:bg-card/90">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-muted-foreground">
                  Nivel da conta
                </p>
                <p className="mt-2 text-3xl font-black tracking-tight text-foreground">
                  {completionPct}%
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
            </div>

            <p className="mt-3 text-sm text-muted-foreground">
              Quanto mais completo seu perfil, mais rapida fica a jornada do pedido ate o suporte.
            </p>

            <div className="mt-4">
              <Progress value={completionPct} className="h-2.5" />
            </div>

            <div className="mt-4 space-y-3">
              {completionItems.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/80 px-3 py-2.5"
                >
                  <span className="text-sm font-semibold text-foreground">{item.label}</span>
                  <Badge
                    variant="secondary"
                    className={
                      item.ready
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {item.ready ? "Pronto" : "Pendente"}
                  </Badge>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-3">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                <Star className="h-3.5 w-3.5" />
                Experiencia premium
              </p>
              <p className="mt-1 text-sm text-foreground">
                Seus pedidos, enderecos e beneficios agora ficam organizados para decidir mais
                rapido.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.to}
              to={action.to}
              className="card-premium flex items-start gap-3 rounded-[1.5rem] border-none bg-gradient-to-br from-card to-muted/25 p-4"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-foreground">{action.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{action.desc}</p>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          );
        })}
      </section>

      {GROUPS.map((group) => (
        <section key={group.title} className="space-y-2">
          <h2 className="px-1 text-[11px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
            {group.title}
          </h2>
          <div className="card-premium overflow-hidden rounded-[1.75rem] border-none bg-gradient-to-br from-card to-muted/20">
            {group.items.map((item, index) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/35 ${
                    index > 0 ? "border-t border-border/70" : ""
                  }`}
                >
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                      item.accent
                        ? "bg-gradient-to-br from-primary to-[hsl(19,100%,45%)] text-primary-foreground"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">{item.label}</p>
                      {item.accent && (
                        <Badge
                          variant="outline"
                          className="border-primary/30 bg-primary/10 text-primary"
                        >
                          Premium
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <Button variant="outline" className="w-full rounded-2xl" onClick={sair} disabled={signingOut}>
        {signingOut ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <LogOut className="mr-2 h-4 w-4" />
        )}
        Sair da conta
      </Button>

      <div className="flex flex-col items-center gap-1 pt-2 text-center">
        <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
          <Shield className="h-3 w-3" /> WiFome Cliente
        </div>
        <p className="text-[11px] text-muted-foreground">Versao {APP_VERSION}</p>
      </div>
    </div>
  );
}

function HeroMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-border dark:bg-card/80">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}
