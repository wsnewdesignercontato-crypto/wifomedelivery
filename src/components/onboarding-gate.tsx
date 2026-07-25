import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { PartyPopper, ArrowRight, Loader2, CheckCircle2, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { IFomeLogo } from "@/components/ifome-logo";

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
    setState({
      loading: false,
      complete: !!d.complete,
      missing: Array.isArray(d.missing) ? d.missing : [],
      redirect: d.redirect ?? "/",
    });
  }

  useEffect(() => {
    check();
    // Reavalia quando o usuário volta pra aba (pode ter salvo perfil em outra tela)
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, role]);

  if (state.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (state.complete) return <>{children}</>;

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

        <div className="mb-5 rounded-2xl border border-border/60 bg-background/60 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Dados que faltam
          </p>
          <ul className="space-y-2">
            {state.missing.map((m) => (
              <li key={m} className="flex items-center gap-2 text-sm">
                <Circle className="h-4 w-4 shrink-0 text-primary/60" />
                <span>{FIELD_LABELS[m] ?? m}</span>
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
          onClick={() => navigate({ to: state.redirect })}
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
