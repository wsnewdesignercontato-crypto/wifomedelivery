import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bell,
  Car,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FileText,
  Gauge,
  HelpCircle,
  Loader2,
  LogOut,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { LocationToggleCard } from "@/components/location-toggle-card";
import { PushToggleCard } from "@/components/push-toggle-card";
import { supabase } from "@/integrations/supabase/client";
import { useMyCourier } from "@/hooks/use-courier";
import { getKycLabel, normalizeReviewStatus } from "@/lib/courier-approval";

export const Route = createFileRoute("/_authenticated/entregador/perfil/")({
  component: PerfilHub,
});

const APP_VERSION = "1.0.0";

const GROUPS: Array<{
  title: string;
  items: Array<{
    to:
      | "/entregador/perfil/dados"
      | "/entregador/veiculo"
      | "/entregador/documentos"
      | "/entregador/perfil/pagamento"
      | "/entregador/carteira"
      | "/entregador/notificacoes"
      | "/entregador/configuracoes"
      | "/entregador/suporte";
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
        to: "/entregador/perfil/dados",
        label: "Meus dados",
        desc: "Nome, telefone, foto, RG e CPF",
        icon: User,
      },
      {
        to: "/entregador/veiculo",
        label: "Meu veiculo",
        desc: "Marca, modelo, placa e ano",
        icon: Car,
      },
      {
        to: "/entregador/documentos",
        label: "Documentos KYC",
        desc: "CNH, selfie e comprovantes",
        icon: FileText,
        accent: true,
      },
    ],
  },
  {
    title: "Financeiro",
    items: [
      {
        to: "/entregador/perfil/pagamento",
        label: "Dados de pagamento",
        desc: "PIX, banco e titular",
        icon: CreditCard,
      },
      {
        to: "/entregador/carteira",
        label: "Carteira e saques",
        desc: "Saldo, extrato e saque via PIX",
        icon: Wallet,
      },
    ],
  },
  {
    title: "Preferencias",
    items: [
      {
        to: "/entregador/notificacoes",
        label: "Notificacoes",
        desc: "Alertas de corridas e avisos",
        icon: Bell,
      },
      {
        to: "/entregador/configuracoes",
        label: "Configuracoes",
        desc: "Som, GPS, privacidade e suporte",
        icon: Settings,
      },
    ],
  },
  {
    title: "Suporte",
    items: [
      {
        to: "/entregador/suporte",
        label: "Ajuda e suporte",
        desc: "Fale com o time WiFome",
        icon: HelpCircle,
      },
    ],
  },
];

const STATUS_LABEL: Record<string, string> = {
  online: "Online",
  offline: "Offline",
  ocupado: "Em corrida",
  pendente: "Pendente",
  bloqueado: "Bloqueado",
  aprovado: "Aprovado",
};

function PerfilHub() {
  const { courier, userId, isLoading } = useMyCourier();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const profileQ = useQuery({
    queryKey: ["courier-profile-mini", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("nome, foto_url, telefone")
        .eq("id", userId)
        .maybeSingle();
      return data;
    },
    enabled: !!userId,
  });

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

  const nome = profileQ.data?.nome?.trim() || "Entregador WiFome";
  const foto = courier?.foto_url || profileQ.data?.foto_url || "";
  const telefone = courier?.telefone || profileQ.data?.telefone || "Telefone nao informado";
  const initials = useMemo(
    () =>
      nome
        .split(" ")
        .map((piece) => piece[0])
        .slice(0, 2)
        .join("")
        .toUpperCase() || "EN",
    [nome],
  );

  const statusLabel = STATUS_LABEL[courier?.status ?? "offline"] ?? courier?.status ?? "Offline";
  const kyc = courier?.kyc_status ?? null;
  const kycState = normalizeReviewStatus(kyc);
  const kycLabel = getKycLabel(kyc);
  const statusClass =
    courier?.status === "online"
      ? "bg-emerald-500 text-white"
      : courier?.status === "ocupado"
        ? "bg-primary text-primary-foreground"
        : courier?.status === "bloqueado"
          ? "bg-destructive text-destructive-foreground"
          : "bg-muted text-muted-foreground";
  const kycClass =
    kycState === "approved"
      ? "bg-emerald-500 text-white"
      : kycState === "pending"
        ? "bg-amber-500 text-white"
        : kycState === "rejected"
          ? "bg-destructive text-destructive-foreground"
          : "bg-muted text-muted-foreground";

  const readinessItems = useMemo(
    () => [
      { label: "Identidade validada", ready: kycState === "approved" },
      { label: "Veiculo cadastrado", ready: Boolean(courier?.veiculo && courier?.placa) },
      {
        label: "Pagamento configurado",
        ready: Boolean(courier?.pix_key || (courier?.banco_nome && courier?.banco_conta)),
      },
      {
        label: "Area de atuacao",
        ready: Boolean(
          courier?.cidade_atuacao ||
          courier?.cidades_atuacao?.length ||
          courier?.bairros_atuacao?.length,
        ),
      },
    ],
    [
      courier?.bairros_atuacao,
      courier?.banco_conta,
      courier?.banco_nome,
      courier?.cidade_atuacao,
      courier?.cidades_atuacao,
      courier?.pix_key,
      courier?.placa,
      courier?.veiculo,
      kycState,
    ],
  );

  const readinessPct = Math.round(
    (readinessItems.filter((item) => item.ready).length / readinessItems.length) * 100,
  );

  const metrics = [
    {
      label: "Entregas",
      value: String(courier?.entregas_total ?? 0),
      hint: "Historico concluido",
    },
    {
      label: "Avaliacao",
      value: courier?.avaliacao ? Number(courier.avaliacao).toFixed(1) : "--",
      hint: "Media recebida",
    },
    {
      label: "Aceitacao",
      value: courier?.aceitacao_pct != null ? `${Math.round(courier.aceitacao_pct)}%` : "--",
      hint: "Corridas aceitas",
    },
    {
      label: "Cancelamento",
      value: courier?.cancelamento_pct != null ? `${Math.round(courier.cancelamento_pct)}%` : "--",
      hint: "Quanto menor, melhor",
    },
  ];

  const quickActions = [
    {
      to: "/entregador/documentos" as const,
      label: "Documentos",
      desc: kycState === "approved" ? "Tudo aprovado" : `Status atual: ${kycLabel}`,
      icon: FileText,
    },
    {
      to: "/entregador/perfil/pagamento" as const,
      label: "Pagamento",
      desc: courier?.pix_key ? "PIX pronto para saque" : "Complete para receber",
      icon: CreditCard,
    },
    {
      to: "/entregador/veiculo" as const,
      label: "Veiculo",
      desc: courier?.veiculo || "Cadastre sua moto, bike ou carro",
      icon: Car,
    },
    {
      to: "/entregador/configuracoes" as const,
      label: "Ajustes",
      desc: "Som, GPS e seguranca",
      icon: Settings,
    },
  ];

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-10">
      <section className="card-premium relative overflow-hidden border-none bg-gradient-to-br from-primary/12 via-white to-primary/5 p-5 dark:from-primary/15 dark:via-card dark:to-primary/10 sm:p-6">
        <div className="absolute -left-10 top-0 h-36 w-36 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -right-10 bottom-0 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative grid gap-6 xl:grid-cols-[1.1fr_0.9fr] xl:items-start">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={statusClass}>{statusLabel}</Badge>
              <Badge className={kycClass}>
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                KYC {kycLabel}
              </Badge>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[1.75rem] bg-primary/10 text-2xl font-black text-primary ring-1 ring-primary/15">
                {foto ? <img src={foto} alt="" className="h-full w-full object-cover" /> : initials}
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="truncate text-3xl font-black tracking-tight text-foreground">
                  {nome}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">{telefone}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Painel central para manter seus dados, validacao e recebimentos sempre prontos.
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to="/entregador/perfil/dados">
                    <Button size="sm" className="rounded-full">
                      Editar perfil
                    </Button>
                  </Link>
                  <Link to="/entregador/carteira">
                    <Button size="sm" variant="outline" className="rounded-full">
                      Ver carteira
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => (
                <HeroMetric
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  hint={metric.hint}
                />
              ))}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-card backdrop-blur dark:border-border dark:bg-card/90">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-muted-foreground">
                  Prontidao operacional
                </p>
                <p className="mt-2 text-3xl font-black tracking-tight text-foreground">
                  {readinessPct}%
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Gauge className="h-5 w-5" />
              </div>
            </div>

            <p className="mt-3 text-sm text-muted-foreground">
              Quanto mais completo seu setup, mais fluida fica sua rotina de corridas e saques.
            </p>

            <div className="mt-4">
              <Progress value={readinessPct} className="h-2.5" />
            </div>

            <div className="mt-4 space-y-3">
              {readinessItems.map((item) => (
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
                    {item.ready ? "Pronto" : "Ajustar"}
                  </Badge>
                </div>
              ))}
            </div>

            <div
              className={`mt-4 rounded-2xl border p-3 ${
                kycState === "approved"
                  ? "border-emerald-500/20 bg-emerald-500/10"
                  : "border-amber-500/20 bg-amber-500/10"
              }`}
            >
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
                {kycState === "approved" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                )}
                Status de conta
              </p>
              <p className="mt-1 text-sm text-foreground">
                {kycState === "approved"
                  ? "Sua conta esta pronta para operar com mais autonomia."
                  : "Conclua documentos e pagamento para liberar toda a experiencia do entregador."}
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

      {kycState !== "approved" && (
        <section className="card-premium rounded-[1.75rem] border border-amber-500/20 bg-amber-500/10 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-foreground">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            Falta pouco para liberar toda a operacao
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Envie CNH, selfie e comprovantes em Documentos. Sem validacao voce nao consegue
            solicitar saques.
          </p>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="px-1 text-[11px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
          Permissoes do aparelho
        </h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <PushToggleCard />
          <LocationToggleCard />
        </div>
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
                          Prioridade
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
          <Shield className="h-3 w-3" /> WiFome Entregador
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
