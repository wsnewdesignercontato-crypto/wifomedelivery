import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { PartyPopper, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { WifomeLoader } from "@/components/wifome-loader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { IFomeLogo } from "@/components/ifome-logo";
import { toast } from "sonner";
import { DATA_UPDATED_EVENT, PROFILE_UPDATED_EVENT } from "@/lib/app-refresh";

type Role = "cliente" | "estabelecimento" | "entregador";

const FIELD_LABELS: Record<string, string> = {
  nome: "Nome completo",
  telefone: "Telefone / WhatsApp",
  cep: "CEP",
  rua: "Rua",
  numero: "Número",
  bairro: "Bairro",
  cidade: "Cidade",
  estado: "Estado",
  nome_loja: "Nome da loja",
  telefone_loja: "Telefone da loja",
  cnpj: "CNPJ",
  endereco: "Endereço da loja",
  veiculo: "Veículo",
  placa: "Placa do veículo",
  cpf: "CPF",
  cidade_atuacao: "Cidade de atuação",
};

const ROLE_TITLES: Record<Role, string> = {
  cliente: "Falta pouco pra você começar a pedir!",
  estabelecimento: "Falta pouco pra sua loja abrir!",
  entregador: "Falta pouco pra você começar a rodar!",
};

const ROLE_CTAS: Record<Role, string> = {
  cliente: "Cadastrar meu endereço",
  estabelecimento: "Completar cadastro da loja",
  entregador: "Completar meu perfil",
};

export function OnboardingGate({
  role,
  userId,
  children,
}: {
  role: Role;
  userId: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [state, setState] = useState<{
    loading: boolean;
    complete: boolean;
    missing: string[];
    redirect: string;
  }>({ loading: true, complete: false, missing: [], redirect: "/" });

  async function check() {
    const { data, error } = await supabase.rpc("check_profile_complete", {
      _user_id: userId,
      _role: role,
    });
    if (error) {
      // Em erro, libera para não travar o app
      setState({ loading: false, complete: true, missing: [], redirect: "/" });
      return;
    }
    const d = (data ?? {}) as { complete?: boolean; missing?: string[]; redirect?: string };
    setState((prev) => {
      const nowComplete = !!d.complete;
      if (nowComplete && !prev.complete && !prev.loading) {
        toast.success("Cadastro completo! App liberado 🎉");
      }
      return {
        loading: false,
        complete: nowComplete,
        missing: Array.isArray(d.missing) ? d.missing : [],
        redirect: d.redirect ?? "/",
      };
    });
  }

  useEffect(() => {
    check();
    const onFocus = () => check();
    const onProfileUpdated = () => check();
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
    window.addEventListener(DATA_UPDATED_EVENT, onProfileUpdated);
    document.addEventListener("visibilitychange", onVisible);

    // Realtime: qualquer alteração nas tabelas de cadastro do usuário re-verifica na hora
    const channel = supabase
      .channel(`onboarding-${role}-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, () => check())
      .on("postgres_changes", { event: "*", schema: "public", table: "addresses", filter: `user_id=eq.${userId}` }, () => check())
      .on("postgres_changes", { event: "*", schema: "public", table: "courier_profiles", filter: `user_id=eq.${userId}` }, () => check())
      .on("postgres_changes", { event: "*", schema: "public", table: "courier_vehicles", filter: `courier_id=eq.${userId}` }, () => check())
      .on("postgres_changes", { event: "*", schema: "public", table: "courier_documents", filter: `courier_id=eq.${userId}` }, () => check())
      .on("postgres_changes", { event: "*", schema: "public", table: "establishments", filter: `owner_id=eq.${userId}` }, () => check())
      .subscribe();

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
      window.removeEventListener(DATA_UPDATED_EVENT, onProfileUpdated);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, role]);

  // Enquanto estiver bloqueado, re-verifica periodicamente (fallback do realtime)
  useEffect(() => {
    if (state.loading || state.complete) return;
    const id = window.setInterval(() => check(), 4000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.loading, state.complete, userId, role]);

  if (state.loading) {
    return (
      <WifomeLoader
        perfil={
          role === "estabelecimento" ? "estabelecimento" : role === "entregador" ? "entregador" : "cliente"
        }
      />
    );
  }

  // Libera navegação para a própria página de completar dados e sub-rotas relacionadas
  const ONBOARDING_ALLOWED: Record<Role, string[]> = {
    cliente: [
      "/cliente/perfil",
      "/cliente/perfil/enderecos",
      "/cliente/perfil/conta",
      "/cliente/perfil/notificacoes",
      "/cliente/perfil/dispositivo",
      "/cliente/perfil/ajuda",
      "/cliente/perfil/termos",
    ],
    estabelecimento: [
      "/estabelecimento/configuracoes",
      "/estabelecimento/carteira",
      "/estabelecimento/equipe",
    ],
    entregador: [
      "/entregador/perfil",
      "/entregador/perfil/dados",
      "/entregador/perfil/pagamento",
      "/entregador/veiculo",
      "/entregador/documentos",
      "/entregador/notificacoes",
      "/entregador/configuracoes",
      "/entregador/suporte",
      "/entregador/carteira",
    ],
  };

  const isOnAllowedPath =
    pathname === state.redirect ||
    ONBOARDING_ALLOWED[role].some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (state.complete || isOnAllowedPath) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-gradient-to-br from-background via-background to-primary/10 p-4">
      <div className="relative w-full max-w-md rounded-3xl border border-primary/20 bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <div className="mb-4 flex justify-center">
          <IFomeLogo size="md" />
        </div>

        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 shadow-lg shadow-primary/30">
            <PartyPopper className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Parabéns pelo cadastro! 🎉
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            {ROLE_TITLES[role]} Vamos completar seus dados obrigatórios pra liberar o app.
          </p>
        </div>

        <div className="mb-5 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-destructive">
            Obrigatório · Dados que faltam
          </p>
          <ul className="space-y-2">
            {state.missing.map((m) => (
              <li
                key={m}
                className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{FIELD_LABELS[m] ?? m}</span>
                <span className="ml-auto text-[11px] font-bold uppercase">Pendente</span>
              </li>
            ))}
            {state.missing.length === 0 && (
              <li className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4 shrink-0" /> Tudo pronto!
              </li>
            )}
          </ul>
        </div>

        <Button
          size="lg"
          className="w-full gap-2 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/30 hover:from-primary hover:to-primary"
          onClick={() => navigate({ to: state.redirect as any })}
        >
          {ROLE_CTAS[role]} <ArrowRight className="h-4 w-4" />
        </Button>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Esses dados são obrigatórios para usar o WiFome com segurança.
        </p>
      </div>
    </div>
  );
}
