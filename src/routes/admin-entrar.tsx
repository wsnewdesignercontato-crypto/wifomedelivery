import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, Lock } from "lucide-react";

export const Route = createFileRoute("/admin-entrar")({
  head: () => ({
    meta: [
      { title: "WiFome Admin — Acesso Master" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) throw error ?? new Error("Falha no login");

      // Verify admin role via user_roles (RLS permite ler as próprias linhas)
      const { data: roleRow, error: roleErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (roleErr || !roleRow) {
        await supabase.auth.signOut();
        toast.error("Acesso negado. Esta área é exclusiva para administradores master.");
        return;
      }


      toast.success("Bem-vindo, Admin Master");
      navigate({ to: "/admin" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-950 via-black to-zinc-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-[0_0_40px_rgba(255,107,0,0.4)] mb-4">
            <ShieldCheck className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">WiFome Admin</h1>
          <p className="text-sm text-zinc-400 mt-2">Painel Master da Plataforma</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur p-6 space-y-4 shadow-2xl"
        >
          <div className="flex items-center gap-2 text-xs text-orange-400 mb-2">
            <Lock className="h-3.5 w-3.5" />
            Acesso restrito a administradores
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-zinc-300">E-mail</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-white"
              placeholder="admin@wifome.dev"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-zinc-300">Senha</Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-white"
              placeholder="••••••••"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold"
          >
            {loading ? "Entrando..." : "Entrar no painel master"}
          </Button>

          <p className="text-xs text-zinc-500 text-center pt-2">
            Não é administrador?{" "}
            <a href="/auth" className="text-orange-400 hover:underline">
              Ir para o app
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
