import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { IFomeLogo } from "@/components/ifome-logo";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrength } from "@/components/ui/password-strength";
import { senhaForteSchema } from "@/lib/password-strength";

const perfilSchema = z.enum(["cliente", "estabelecimento", "entregador"]).catch("cliente");

export const Route = createFileRoute("/redefinir-senha")({
  validateSearch: z.object({ perfil: perfilSchema.optional() }),
  ssr: false,
  head: () => ({
    meta: [
      { title: "Redefinir senha — WiFome" },
      {
        name: "description",
        content:
          "Crie uma nova senha para sua conta WiFome e volte a acessar o app de cliente, estabelecimento ou entregador.",
      },
      { property: "og:title", content: "Redefinir senha — WiFome" },
      {
        property: "og:description",
        content: "Defina uma nova senha para sua conta WiFome com segurança.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

const senhaSchema = senhaForteSchema;

function ResetPasswordPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const perfil = search.perfil ?? "cliente";
  const themeClass =
    perfil === "estabelecimento"
      ? "theme-estab"
      : perfil === "entregador"
        ? "theme-entregador"
        : "";

  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [novaSenha, setNovaSenha] = useState("");

  useEffect(() => {
    let mounted = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setValid(true);
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) setValid(true);
      setReady(true);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const senha = String(form.get("senha") ?? "");
    const confirmar = String(form.get("confirmar") ?? "");
    const parsed = senhaSchema.safeParse(senha);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Senha inválida");
      return;
    }
    if (senha !== confirmar) {
      toast.error("As senhas não coincidem");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }
    await supabase.auth.signOut();
    setLoading(false);
    setDone(true);
    toast.success("Parabéns! Sua senha foi alterada.");
  }

  function goToLogin() {
    navigate({ to: "/auth", search: { perfil }, replace: true });
  }

  return (
    <div className={`relative min-h-screen bg-background ${themeClass}`}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 opacity-40"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, color-mix(in oklab, var(--primary) 35%, transparent) 0%, transparent 70%)",
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-4 py-6">
        <Link
          to="/auth"
          search={{ perfil }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao login
        </Link>

        <div className="mt-6 text-center">
          <IFomeLogo size="lg" showWord={false} className="mx-auto" perfil={perfil} />
          <h1 className="mt-4 text-2xl font-black tracking-tight text-foreground">
            Criar nova senha
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Escolha uma senha nova para sua conta.
          </p>
        </div>

        <div className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-card">
          {!ready ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : done ? (
            <div className="space-y-5 py-4 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              </div>
              <div className="space-y-1">
                <p className="text-xl font-black tracking-tight text-foreground">
                  Senha redefinida com sucesso!
                </p>
                <p className="text-sm text-muted-foreground">
                  Sua nova senha já está ativa e você pode usá-la para fazer login agora mesmo.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-muted/40 p-4 text-left">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Resumo
                </p>
                <ul className="mt-3 space-y-2 text-sm text-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span>Senha atualizada com segurança</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span>Sessão de recuperação encerrada</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span>Pronto para login com a nova senha</span>
                  </li>
                </ul>
              </div>

              <Button
                onClick={goToLogin}
                className="w-full bg-gradient-brand text-primary-foreground shadow-brand hover:opacity-95"
              >
                Fazer login com a nova senha
              </Button>
            </div>
          ) : !valid ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                Este link de recuperação é inválido ou expirou. Solicite um novo link na tela de
                login.
              </p>
              <Button asChild className="w-full bg-gradient-brand text-primary-foreground">
                <Link to="/auth" search={{ perfil }}>
                  Ir para o login
                </Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="senha">Nova senha</Label>
                <PasswordInput
                  id="senha"
                  name="senha"
                  autoComplete="new-password"
                  required
                  placeholder="Crie uma senha segura"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                />
                <PasswordStrength value={novaSenha} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmar">Confirmar nova senha</Label>
                <PasswordInput
                  id="confirmar"
                  name="confirmar"
                  autoComplete="new-password"
                  required
                  placeholder="Repita a nova senha"
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-brand text-primary-foreground shadow-brand hover:opacity-95"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar nova senha"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
