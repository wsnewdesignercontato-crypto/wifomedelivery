import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  ChevronRight, User, Car, FileText, CreditCard, ShieldCheck,
  Bell, HelpCircle, Settings, LogOut, Loader2, Shield, Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMyCourier } from "@/hooks/use-courier";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/entregador/perfil/")({
  component: PerfilHub,
});

const APP_VERSION = "1.0.0";

const GROUPS = [
  {
    title: "Conta",
    items: [
      { to: "/entregador/perfil/dados", label: "Meus dados", desc: "Nome, telefone, foto, RG, CPF", icon: User },
      { to: "/entregador/veiculo", label: "Meu veículo", desc: "Marca, modelo, placa, ano", icon: Car },
      { to: "/entregador/documentos", label: "Documentos (KYC)", desc: "CNH, selfie, comprovantes", icon: FileText, kyc: true },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { to: "/entregador/perfil/pagamento", label: "Dados de pagamento", desc: "PIX, banco, titular", icon: CreditCard },
      { to: "/entregador/carteira", label: "Carteira e saques", desc: "Saldo, saque via PIX", icon: Wallet },
    ],
  },
  {
    title: "Preferências",
    items: [
      { to: "/entregador/notificacoes", label: "Notificações", desc: "Alertas de corridas", icon: Bell },
      { to: "/entregador/configuracoes", label: "Configurações", desc: "Som, GPS, privacidade", icon: Settings },
    ],
  },
  {
    title: "Suporte",
    items: [
      { to: "/entregador/suporte", label: "Ajuda e suporte", desc: "Fale com o time WiFome", icon: HelpCircle },
    ],
  },
] as const;

function PerfilHub() {
  const { courier, userId, isLoading } = useMyCourier();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const profileQ = useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("nome, foto_url, telefone").eq("id", userId).maybeSingle();
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

  const kyc = courier?.kyc_status ?? "pendente";
  const kycColor =
    kyc === "aprovado" ? "bg-emerald-500 text-white" :
    kyc === "em_analise" ? "bg-amber-500 text-white" :
    kyc === "rejeitado" ? "bg-red-500 text-white" :
    "bg-muted text-muted-foreground";

  const nome = profileQ.data?.nome?.trim() || "Entregador WiFome";
  const foto = courier?.foto_url || profileQ.data?.foto_url || "";
  const telefone = courier?.telefone || profileQ.data?.telefone || "—";
  const initials = nome.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() || "EN";

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Header perfil */}
      <section className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-lg font-black text-primary">
          {foto ? <img src={foto} alt="" className="h-full w-full object-cover" /> : initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{nome}</p>
          <p className="truncate text-xs text-muted-foreground">{telefone}</p>
          <div className="mt-1 flex gap-1">
            <Badge className={kycColor} variant="secondary">
              <ShieldCheck className="mr-1 h-3 w-3" />
              KYC: {kyc}
            </Badge>
          </div>
        </div>
        <Link to="/entregador/perfil/dados" className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/5">
          Editar
        </Link>
      </section>

      {kyc !== "aprovado" && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm">
          <p className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Valide sua conta
          </p>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
            Envie sua CNH, selfie e comprovantes em <b>Documentos</b>. Sem validação você não consegue solicitar saques.
          </p>
        </div>
      )}

      {GROUPS.map((g) => (
        <section key={g.title} className="space-y-2">
          <h2 className="px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{g.title}</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {g.items.map((it, i) => {
              const Icon = it.icon;
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50 ${i > 0 ? "border-t border-border" : ""}`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{it.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{it.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <Button variant="outline" className="w-full" onClick={sair} disabled={signingOut}>
        {signingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
        Sair da conta
      </Button>

      <div className="flex flex-col items-center gap-1 pt-2 text-center">
        <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
          <Shield className="h-3 w-3" /> WiFome Entregador
        </div>
        <p className="text-[11px] text-muted-foreground">Versão {APP_VERSION}</p>
      </div>
    </div>
  );
}
