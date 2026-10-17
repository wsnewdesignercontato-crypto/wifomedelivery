import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { safeReturnPath } from "@/lib/customer-access";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2, ShoppingBag, Store, Bike, MailCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { IFomeLogo } from "@/components/ifome-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrength } from "@/components/ui/password-strength";
import { senhaForteSchema } from "@/lib/password-strength";
import type { AuthSearch } from "@/lib/auth-search";
import type { PerfilApp } from "@/lib/app-profiles";

import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const perfilInfo: Record<
  "cliente" | "estabelecimento" | "entregador",
  { titulo: string; descricao: string; Icon: typeof ShoppingBag }
> = {
  cliente: {
    titulo: "Área do cliente",
    descricao: "Peça, receba e avalie.",
    Icon: ShoppingBag,
  },
  estabelecimento: {
    titulo: "Área do estabelecimento",
    descricao: "Gerencie pedidos e cardápio.",
    Icon: Store,
  },
  entregador: {
    titulo: "Área do entregador",
    descricao: "Aceite corridas e faça entregas.",
    Icon: Bike,
  },
};

const emailSchema = z.string().trim().email({ message: "Email inválido" }).max(255);
const senhaSchema = z
  .string()
  .min(6, { message: "A senha deve ter pelo menos 6 caracteres" })
  .max(72);
const nomeSchema = z.string().trim().min(2, { message: "Informe seu nome" }).max(80);

export function AuthScreen({ search, profile }: { search: AuthSearch; profile?: PerfilApp }) {
  const navigate = useNavigate();
  const perfil: "cliente" | "estabelecimento" | "entregador" =
    profile ?? search.perfil ?? "cliente";
  const info = perfilInfo[perfil];
  const returnPath = safeReturnPath(search.redirect, perfil);
  const finishLogin = useCallback(() => {
    if (returnPath) window.location.assign(returnPath);
    else void navigate({ to: "/app", search: { perfil }, replace: true });
  }, [returnPath, navigate, perfil]);
  const themeClass =
    perfil === "estabelecimento"
      ? "theme-estab"
      : perfil === "entregador"
        ? "theme-entregador"
        : "";
  const [tab, setTab] = useState<"login" | "cadastro">("login");
  const [senhaCad, setSenhaCad] = useState("");

  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [emailSalvo, setEmailSalvo] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  const [modo, setModo] = useState<"form" | "confirmar-email" | "recuperar" | "link-enviado">(
    "form",
  );

  const confirmationUrl = () =>
    `${window.location.origin}/auth?perfil=${perfil}&confirmado=1${returnPath ? `&redirect=${encodeURIComponent(returnPath)}` : ""}`;

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  async function handleReenviar() {
    const email = emailSchema.safeParse(emailSalvo);
    if (!email.success || loading || resendSeconds > 0) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.data,
        options: { emailRedirectTo: confirmationUrl() },
      });
      if (error) {
        if (error.status === 429) {
          setResendSeconds(60);
          toast.error("Aguarde um minuto antes de solicitar outro e-mail.");
        } else {
          toast.error("Não foi possível reenviar a confirmação. Tente novamente mais tarde.");
        }
        return;
      }
      setResendSeconds(60);
      toast.success(
        "Solicitação recebida. Confira a caixa de entrada e o spam. Se já confirmou, entre com sua senha.",
      );
    } catch {
      toast.error("Não foi possível conectar. Confira sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  // Se já autenticado, encaminhar para /app
  const confirmado = search.confirmado === "1";

  // Email salvo do último cadastro/login
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("wifome:last-email");
      if (saved) setEmailSalvo(saved);
    } catch {
      /* ignore */
    }
  }, []);

  // A query parameter alone never proves that an email was confirmed.
  useEffect(() => {
    let cancelled = false;
    const linkError = new URLSearchParams(window.location.hash.slice(1)).has("error");
    void (async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          const { data: verified, error } = await supabase.auth.getUser();
          if (cancelled) return;
          if (error || !verified.user) {
            if (!error || [400, 401, 403, 404].includes(error.status ?? 0))
              await supabase.auth.signOut({ scope: "local" });
            return;
          }
          if (confirmado) {
            if (!verified.user.email_confirmed_at) {
              toast.error("Seu e-mail ainda precisa ser confirmado.");
              return;
            }
            if (verified.user.email) {
              setEmailSalvo(verified.user.email);
              try {
                window.localStorage.setItem("wifome:last-email", verified.user.email);
              } catch {
                /* Storage may be unavailable. */
              }
            }
            await supabase.auth.signOut({ scope: "local" });
            if (!cancelled) toast.success("Email confirmado! Agora entre com sua senha.");
            return;
          }
          finishLogin();
        } else if (confirmado) {
          if (sessionError || linkError)
            toast.error(
              "O link de confirmação é inválido ou expirou. Entre para solicitar outro e-mail.",
            );
          else toast.info("Entre com seu e-mail e senha para continuar.");
        }
      } catch {
        if (!cancelled) toast.error("Não foi possível verificar sua sessão. Tente novamente.");
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [finishLogin, confirmado]);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = z
      .object({ email: emailSchema, senha: senhaSchema })
      .safeParse({ email: form.get("email"), senha: form.get("senha") });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Verifique os dados");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.senha,
      });
      if (error) {
        if (error.code === "email_not_confirmed") {
          setEmailSalvo(parsed.data.email);
          setModo("confirmar-email");
          toast.error(
            "Confirme seu e-mail antes de entrar. Você pode solicitar outro envio abaixo.",
          );
        } else {
          toast.error(
            error.message === "Invalid login credentials"
              ? "Email ou senha inválidos"
              : error.status === 429
                ? "Muitas tentativas. Aguarde um pouco antes de entrar."
                : "Não foi possível entrar. Confira os dados e tente novamente.",
          );
        }
        return;
      }
    } catch {
      toast.error("Não foi possível conectar. Confira sua internet e tente novamente.");
      return;
    } finally {
      setLoading(false);
    }
    try {
      window.localStorage.setItem("wifome:last-email", parsed.data.email);
    } catch {
      /* ignore */
    }
    toast.success("Bem-vindo de volta!");
    finishLogin();
  }

  async function handleCadastro(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = z
      .object({ nome: nomeSchema, email: emailSchema, senha: senhaForteSchema })
      .safeParse({
        nome: form.get("nome"),
        email: form.get("email"),
        senha: form.get("senha"),
      });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Verifique os dados");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.senha,
        options: {
          emailRedirectTo: confirmationUrl(),
          data: {
            nome: parsed.data.nome,
            perfil_inicial: perfil,
          },
        },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      try {
        window.localStorage.setItem("wifome:last-email", parsed.data.email);
      } catch {
        /* ignore */
      }
      setEmailSalvo(parsed.data.email);
      if (data.session) {
        toast.success("Conta criada! Bem-vindo ao PedeTrem.");
        finishLogin();
        return;
      }
      setResendSeconds(60);
      setModo("confirmar-email");
    } catch {
      toast.error("Não foi possível conectar. Confira sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRecuperar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = emailSchema.safeParse(form.get("email"));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Email inválido");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
        redirectTo: `${window.location.origin}/redefinir-senha?perfil=${perfil}`,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      setEmailSalvo(parsed.data);
      setModo("link-enviado");
    } catch {
      toast.error("Não foi possível conectar. Confira sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const Icon = info.Icon;

  return (
    <div className={`relative min-h-dvh bg-background ${themeClass}`}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 opacity-40"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, color-mix(in oklab, var(--primary) 35%, transparent) 0%, transparent 70%)",
        }}
      />
      <div
        className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-5 sm:py-8"
        style={{ paddingBottom: "calc(var(--install-banner-space, 1.5rem) + 1rem)" }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <Link
            to="/"
            className="tap-target inline-flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">Início</span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="mt-3 overflow-hidden transition-all duration-500 ease-in-out">
          {perfil === "cliente" && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate({ to: "/cliente" })}
            >
              Continuar como visitante
            </Button>
          )}
        </div>

        <div className="mt-6 text-center" data-no-reveal>
          <IFomeLogo size="lg" showWord={false} className="mx-auto" perfil={perfil} />
          <h1 className="mx-auto mt-4 max-w-[15ch] text-pretty text-xl font-black leading-tight tracking-tight text-foreground sm:text-2xl">
            {perfil === "cliente"
              ? "Entrar como cliente"
              : perfil === "estabelecimento"
                ? "Entrar como estabelecimento"
                : "Entrar como entregador"}
          </h1>
          <div className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-foreground">
            <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">{info.titulo}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{info.descricao}</p>
        </div>

        <div className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-card sm:p-6">
          {modo === "confirmar-email" || modo === "link-enviado" ? (
            <div className="space-y-4 py-2 text-center">
              <MailCheck className="mx-auto h-12 w-12 text-primary" />

              <h2 className="text-lg font-bold text-foreground">
                {modo === "confirmar-email" ? "Confirme seu e-mail" : "Link enviado!"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {modo === "confirmar-email" ? (
                  <>
                    Confira o e-mail de confirmação em{" "}
                    <span className="font-semibold text-foreground">{emailSalvo}</span>. Confirme
                    seu email para ativar a conta. Se já usa esse e-mail em outro aplicativo
                    PedeTrem, entre com a mesma senha.
                  </>
                ) : (
                  <>
                    Enviamos um link de recuperação para{" "}
                    <span className="font-semibold text-foreground">{emailSalvo}</span>. Abra o
                    email e crie sua nova senha.
                  </>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                Não recebeu? Verifique a caixa de spam e confira se digitou o e-mail corretamente.
              </p>
              {modo === "confirmar-email" && (
                <Button
                  className="w-full"
                  disabled={loading || resendSeconds > 0}
                  onClick={() => void handleReenviar()}
                >
                  {loading
                    ? "Solicitando..."
                    : resendSeconds > 0
                      ? `Reenviar em ${resendSeconds}s`
                      : "Reenviar confirmação"}
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setModo("form");
                  setTab("login");
                }}
              >
                Voltar ao login
              </Button>
            </div>
          ) : modo === "recuperar" ? (
            <form onSubmit={handleRecuperar} className="space-y-4">
              <div className="text-center">
                <h2 className="text-lg font-bold text-foreground">Esqueceu a senha?</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Informe seu email e enviaremos um link para criar uma nova senha.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email-rec">Email</Label>
                <Input
                  id="email-rec"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  defaultValue={emailSalvo}
                  placeholder="voce@exemplo.com"
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-brand text-primary-foreground shadow-brand hover:opacity-95"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Enviar link de recuperação"
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setModo("form")}
              >
                Voltar ao login
              </Button>
            </form>
          ) : (
            <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "cadastro")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="cadastro">Criar conta</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-4">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      defaultValue={emailSalvo}
                      key={emailSalvo}
                      placeholder="voce@exemplo.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="senha">Senha</Label>
                    <PasswordInput
                      id="senha"
                      name="senha"
                      autoComplete="current-password"
                      required
                      placeholder="••••••••"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setModo("recuperar")}
                      className="tap-target -my-1 inline-flex items-center px-1 text-xs font-medium text-primary hover:underline"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-brand text-primary-foreground shadow-brand hover:opacity-95"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="cadastro" className="mt-4">
                <form onSubmit={handleCadastro} className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Já tem conta em outro aplicativo PedeTrem? Use o mesmo e-mail e senha na aba
                    Entrar.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="nome">Nome</Label>
                    <Input
                      id="nome"
                      name="nome"
                      type="text"
                      autoComplete="name"
                      required
                      placeholder="Seu nome"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email-cad">Email</Label>
                    <Input
                      id="email-cad"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="voce@exemplo.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="senha-cad">Senha</Label>
                    <PasswordInput
                      id="senha-cad"
                      name="senha"
                      autoComplete="new-password"
                      required
                      placeholder="Crie uma senha segura"
                      value={senhaCad}
                      onChange={(e) => setSenhaCad(e.target.value)}
                    />
                    <PasswordStrength value={senhaCad} />
                  </div>

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-brand text-primary-foreground shadow-brand hover:opacity-95"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar conta"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Ao criar conta, você concorda com nossos termos e política de privacidade.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </div>

        <div className="flex-1" />
      </div>
    </div>
  );
}
