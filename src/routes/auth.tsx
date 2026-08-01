import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2, ShoppingBag, Store, Bike, MailCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { IFomeLogo } from "@/components/ifome-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const perfilSchema = z.enum(["cliente", "estabelecimento", "entregador"]).catch("cliente");
const searchSchema = z.object({
  perfil: perfilSchema.optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Entrar no WiFome — Acesse sua conta" },
      {
        name: "description",
        content:
          "Acesse sua conta WiFome ou cadastre-se como cliente, estabelecimento ou entregador. Peça, gerencie pedidos ou faça entregas em minutos.",
      },
      { property: "og:title", content: "Entrar no WiFome — Acesse sua conta" },
      {
        property: "og:description",
        content:
          "Faça login ou crie sua conta WiFome para pedir comida, gerenciar seu restaurante ou trabalhar como entregador.",
      },
      { property: "og:url", content: "https://wifomedelivery.lovable.app/auth" },
    ],
    links: [{ rel: "canonical", href: "https://wifomedelivery.lovable.app/auth" }],
  }),
  component: AuthPage,
});

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
const nomeSchema = z
  .string()
  .trim()
  .min(2, { message: "Informe seu nome" })
  .max(80);

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const perfil: "cliente" | "estabelecimento" | "entregador" =
    search.perfil ?? "cliente";
  const info = perfilInfo[perfil];
  const themeClass =
    perfil === "estabelecimento"
      ? "theme-estab"
      : perfil === "entregador"
        ? "theme-entregador"
        : "";
  const [tab, setTab] = useState<"login" | "cadastro">("login");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // Se já autenticado, encaminhar para /app
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate({ to: "/app", search: { perfil }, replace: true });
      } else {
        setCheckingSession(false);
      }
    });
  }, [navigate, perfil]);

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
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.senha,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message === "Invalid login credentials"
        ? "Email ou senha inválidos"
        : error.message);
      return;
    }
    toast.success("Bem-vindo de volta!");
    navigate({ to: "/app", search: { perfil }, replace: true });
  }

  async function handleCadastro(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = z
      .object({ nome: nomeSchema, email: emailSchema, senha: senhaSchema })
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
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.senha,
      options: {
        emailRedirectTo: `${window.location.origin}/app?perfil=${perfil}`,
        data: {
          nome: parsed.data.nome,
          perfil_inicial: perfil,
        },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Conta criada! Você já pode entrar.");
    setTab("login");
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
    <div className={`relative min-h-screen bg-background ${themeClass}`}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 opacity-40"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, color-mix(in oklab, var(--primary) 35%, transparent) 0%, transparent 70%)",
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-4 py-6">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Início
          </Link>
          <ThemeToggle />
        </div>

        <div className="mt-6 text-center">
          <IFomeLogo size="lg" showWord={false} className="mx-auto" perfil={perfil} />
          <h1 className="mt-4 text-2xl font-black tracking-tight text-foreground">
            {perfil === "cliente"
              ? "Entrar como cliente"
              : perfil === "estabelecimento"
                ? "Entrar como estabelecimento"
                : "Entrar como entregador"}
          </h1>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-foreground">
            <Icon className="h-3.5 w-3.5 text-primary" />
            {info.titulo}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{info.descricao}</p>
        </div>

        <div className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-card">
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
                    placeholder="voce@exemplo.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="senha">Senha</Label>
                  <Input
                    id="senha"
                    name="senha"
                    type="password"
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                  />
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
                  <Input
                    id="senha-cad"
                    name="senha"
                    type="password"
                    autoComplete="new-password"
                    required
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-brand text-primary-foreground shadow-brand hover:opacity-95"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar conta"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Ao criar conta, você concorda com nossos termos e política de
                  privacidade.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>

      </div>
    </div>
  );
}
