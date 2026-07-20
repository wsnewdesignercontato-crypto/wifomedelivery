import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, User, Loader2, Upload } from "lucide-react";
import { useRef } from "react";
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
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadFoto(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 5MB)");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (up.error) {
      setUploading(false);
      toast.error(up.error.message);
      return;
    }
    const signed = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
    setUploading(false);
    if (signed.error || !signed.data) {
      toast.error(signed.error?.message ?? "Falha ao gerar URL");
      return;
    }
    setProfile((p) => (p ? { ...p, foto_url: signed.data!.signedUrl } : p));
    toast.success("Foto carregada — clique em Salvar");
  }

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
          <div className="sm:col-span-2 space-y-2">
            <Label>Foto do perfil</Label>
            {profile?.foto_url ? (
              <img src={profile.foto_url} alt="Avatar" className="h-20 w-20 rounded-full object-cover border border-border" />
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFoto(f);
                  e.target.value = "";
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="h-4 w-4 mr-1" /> Enviar imagem</>}
              </Button>
              {profile?.foto_url && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setProfile(profile ? { ...profile, foto_url: "" } : null)}>
                  Remover
                </Button>
              )}
            </div>
            <Input
              value={profile?.foto_url ?? ""}
              onChange={(e) => setProfile(profile ? { ...profile, foto_url: e.target.value } : null)}
              placeholder="ou cole uma URL: https://..."
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
