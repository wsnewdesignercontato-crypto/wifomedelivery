import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, User, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/cliente/perfil/conta")({
  component: ContaPage,
});

type Profile = { id: string; nome: string; telefone: string | null; foto_url: string | null };

function ContaPage() {
  const { user } = Route.useRouteContext() as { user: { id: string; email?: string } };
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [novaSenha, setNovaSenha] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,nome,telefone,foto_url")
        .eq("id", user.id)
        .maybeSingle();
      setProfile(data as Profile | null);
      setLoading(false);
    })();
  }, [user.id]);

  async function salvarPerfil() {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ nome: profile.nome, telefone: profile.telefone, foto_url: profile.foto_url })
      .eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Perfil atualizado");
  }

  async function trocarSenha() {
    if (novaSenha.length < 6) {
      toast.error("Senha muito curta");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    if (error) toast.error(error.message);
    else {
      toast.success("Senha atualizada");
      setNovaSenha("");
    }
  }

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );

  return (
    <div className="space-y-5">
      <Link to="/cliente/perfil" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ChevronLeft className="h-4 w-4" /> Voltar
      </Link>

      <h1 className="text-xl font-bold">Minha conta</h1>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <User className="h-4 w-4 text-primary" /> Dados pessoais
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Nome</Label>
            <Input
              value={profile?.nome ?? ""}
              onChange={(e) => setProfile(profile ? { ...profile, nome: e.target.value } : null)}
            />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input
              value={profile?.telefone ?? ""}
              onChange={(e) => setProfile(profile ? { ...profile, telefone: e.target.value } : null)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Foto (URL)</Label>
            <Input
              value={profile?.foto_url ?? ""}
              onChange={(e) => setProfile(profile ? { ...profile, foto_url: e.target.value } : null)}
              placeholder="https://..."
            />
          </div>
        </div>
        <Button onClick={salvarPerfil} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
        </Button>
        <p className="text-xs text-muted-foreground">E-mail: {user.email}</p>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Trocar senha</h2>
        <Input
          type="password"
          value={novaSenha}
          onChange={(e) => setNovaSenha(e.target.value)}
          placeholder="Nova senha (mín. 6)"
        />
        <Button variant="outline" onClick={trocarSenha}>
          Atualizar senha
        </Button>
      </section>

      <Button
        variant="ghost"
        className="w-full text-destructive"
        onClick={() => navigate({ to: "/cliente/perfil" })}
      >
        Cancelar
      </Button>
    </div>
  );
}
