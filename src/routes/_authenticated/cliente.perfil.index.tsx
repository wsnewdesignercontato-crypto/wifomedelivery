import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  User,
  MapPin,
  Bell,
  Crown,
  Gift,
  Smartphone,
  HelpCircle,
  FileText,
  LogOut,
  Loader2,
  Shield,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/cliente/perfil/")({
  component: PerfilHub,
});

type ProfileMini = { nome: string; telefone: string | null; foto_url: string | null };

const APP_VERSION = "1.0.0";

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
      { to: "/cliente/perfil/conta", label: "Minha conta", desc: "Nome, telefone, foto e senha", icon: User },
      { to: "/cliente/perfil/enderecos", label: "Endereços", desc: "Casa, trabalho e outros", icon: MapPin },
    ],
  },
  {
    title: "Vantagens WiFome",
    items: [
      { to: "/cliente/perfil/clube", label: "Clube WiFome", desc: "Assinatura com fretes grátis", icon: Crown, accent: true },
      { to: "/cliente/perfil/recompensas", label: "Recompensas e benefícios", desc: "Cupons, cashback e conquistas", icon: Gift },
    ],
  },
  {
    title: "Preferências",
    items: [
      { to: "/cliente/perfil/notificacoes", label: "Notificações", desc: "E-mail, push e promoções", icon: Bell },
      { to: "/cliente/perfil/dispositivo", label: "Configurações do dispositivo", desc: "Permissões, som e localização", icon: Smartphone },
    ],
  },
  {
    title: "Sobre",
    items: [
      { to: "/cliente/perfil/ajuda", label: "Ajuda e suporte", desc: "Central de atendimento", icon: HelpCircle },
      { to: "/cliente/perfil/termos", label: "Termos e privacidade", desc: "Políticas do WiFome", icon: FileText },
    ],
  },
];

function PerfilHub() {
  const { user } = Route.useRouteContext() as { user: { id: string; email?: string } };
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileMini | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("nome,telefone,foto_url")
        .eq("id", user.id)
        .maybeSingle();
      setProfile((data as ProfileMini | null) ?? { nome: "", telefone: null, foto_url: null });
      setLoading(false);
    })();
  }, [user.id]);

  async function sair() {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      navigate({ to: "/", replace: true });
    } catch (e) {
      setSigningOut(false);
      toast.error("Erro ao sair");
    }
  }

  const initials = (profile?.nome ?? user.email ?? "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-5">
      {/* Header do usuário */}
      <section className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-lg font-black text-primary">
          {profile?.foto_url ? (
            <img src={profile.foto_url} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <div className="min-w-0 flex-1">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              <p className="truncate font-bold">{profile?.nome || "Cliente WiFome"}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              {profile?.telefone && (
                <p className="truncate text-xs text-muted-foreground">{profile.telefone}</p>
              )}
            </>
          )}
        </div>
        <Link
          to="/cliente/perfil/conta"
          className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
        >
          Editar
        </Link>
      </section>

      {/* Menu por grupos */}
      {GROUPS.map((g) => (
        <section key={g.title} className="space-y-2">
          <h2 className="px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {g.title}
          </h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {g.items.map((it, i) => {
              const Icon = it.icon;
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50 ${
                    i > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      it.accent
                        ? "bg-gradient-to-br from-primary to-[hsl(19,100%,45%)] text-primary-foreground"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
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

      {/* Sair */}
      <Button
        variant="outline"
        className="w-full"
        onClick={sair}
        disabled={signingOut}
      >
        {signingOut ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <LogOut className="mr-2 h-4 w-4" />
        )}
        Sair da conta
      </Button>

      {/* Versão */}
      <div className="flex flex-col items-center gap-1 pt-2 text-center">
        <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
          <Shield className="h-3 w-3" /> WiFome
        </div>
        <p className="text-[11px] text-muted-foreground">Versão {APP_VERSION}</p>
      </div>

      {/* Voltar (fallback) — invisível, apenas para consistência de ícone */}
      <div className="sr-only">
        <ChevronLeft />
      </div>
    </div>
  );
}
