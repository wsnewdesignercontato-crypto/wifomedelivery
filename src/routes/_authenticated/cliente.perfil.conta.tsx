import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LogOut, MapPin, Plus, Trash2, User, Loader2, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/cliente/perfil/conta")({
  component: PerfilPage,
});

type Profile = { id: string; nome: string; telefone: string | null; foto_url: string | null };
type Addr = {
  id: string;
  label: string;
  rua: string;
  numero: string | null;
  bairro: string | null;
  cidade: string;
  estado: string | null;
  cep: string | null;
  is_default: boolean;
};

function PerfilPage() {
  const { user } = Route.useRouteContext() as { user: { id: string; email?: string } };
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [addrs, setAddrs] = useState<Addr[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [novo, setNovo] = useState({ label: "Casa", rua: "", numero: "", bairro: "", cidade: "", estado: "", cep: "" });
  const [novaSenha, setNovaSenha] = useState("");

  useEffect(() => {
    (async () => {
      const [p, a] = await Promise.all([
        supabase.from("profiles").select("id,nome,telefone,foto_url").eq("id", user.id).maybeSingle(),
        supabase.from("addresses").select("*").eq("user_id", user.id).order("is_default", { ascending: false }),
      ]);
      setProfile(p.data as Profile | null);
      setAddrs((a.data ?? []) as Addr[]);
      setLoading(false);
    })();
  }, [user.id]);

  async function salvarPerfil() {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      nome: profile.nome, telefone: profile.telefone, foto_url: profile.foto_url,
    }).eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Perfil atualizado");
  }

  async function addAddr() {
    if (!novo.rua.trim() || !novo.cidade.trim()) { toast.error("Rua e cidade obrigatórios"); return; }
    const { data, error } = await supabase.from("addresses").insert({
      user_id: user.id, ...novo, is_default: addrs.length === 0,
    }).select("*").single();
    if (error) { toast.error(error.message); return; }
    setAddrs((prev) => [data as Addr, ...prev]);
    setNovo({ label: "Casa", rua: "", numero: "", bairro: "", cidade: "", estado: "", cep: "" });
  }
  async function delAddr(id: string) {
    await supabase.from("addresses").delete().eq("id", id);
    setAddrs((prev) => prev.filter((a) => a.id !== id));
  }
  async function setDefault(id: string) {
    await supabase.from("addresses").update({ is_default: false }).eq("user_id", user.id);
    await supabase.from("addresses").update({ is_default: true }).eq("id", id);
    setAddrs((prev) => prev.map((a) => ({ ...a, is_default: a.id === id })));
  }
  async function trocarSenha() {
    if (novaSenha.length < 6) { toast.error("Senha muito curta"); return; }
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    if (error) toast.error(error.message);
    else { toast.success("Senha atualizada"); setNovaSenha(""); }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Perfil</h1>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><User className="h-4 w-4 text-primary" /> Meus dados</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Nome</Label><Input value={profile?.nome ?? ""} onChange={(e) => setProfile(profile ? { ...profile, nome: e.target.value } : null)} /></div>
          <div><Label>Telefone</Label><Input value={profile?.telefone ?? ""} onChange={(e) => setProfile(profile ? { ...profile, telefone: e.target.value } : null)} /></div>
          <div className="sm:col-span-2"><Label>Foto (URL)</Label><Input value={profile?.foto_url ?? ""} onChange={(e) => setProfile(profile ? { ...profile, foto_url: e.target.value } : null)} placeholder="https://..." /></div>
        </div>
        <Button onClick={salvarPerfil} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}</Button>
        <p className="text-xs text-muted-foreground">E-mail: {user.email}</p>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><MapPin className="h-4 w-4 text-primary" /> Meus endereços</h2>
        {addrs.length === 0 && <p className="text-xs text-muted-foreground">Nenhum endereço cadastrado.</p>}
        {addrs.map((a) => (
          <div key={a.id} className="flex items-start justify-between gap-2 rounded-xl border border-border p-3 text-sm">
            <div>
              <p className="font-semibold">{a.label} {a.is_default && <Star className="ml-1 inline h-3 w-3 fill-primary text-primary" />}</p>
              <p className="text-xs text-muted-foreground">{a.rua}{a.numero ? `, ${a.numero}` : ""}{a.bairro ? ` — ${a.bairro}` : ""} — {a.cidade}{a.estado ? `/${a.estado}` : ""}</p>
            </div>
            <div className="flex gap-1">
              {!a.is_default && <Button size="sm" variant="ghost" onClick={() => setDefault(a.id)}>Padrão</Button>}
              <Button size="icon" variant="ghost" onClick={() => delAddr(a.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
        <div className="grid gap-2 rounded-xl border border-dashed border-border p-3 sm:grid-cols-2">
          <Input placeholder="Rótulo (Casa/Trabalho)" value={novo.label} onChange={(e) => setNovo({ ...novo, label: e.target.value })} />
          <Input placeholder="CEP" value={novo.cep} onChange={(e) => setNovo({ ...novo, cep: e.target.value })} />
          <Input placeholder="Rua" value={novo.rua} onChange={(e) => setNovo({ ...novo, rua: e.target.value })} />
          <Input placeholder="Número" value={novo.numero} onChange={(e) => setNovo({ ...novo, numero: e.target.value })} />
          <Input placeholder="Bairro" value={novo.bairro} onChange={(e) => setNovo({ ...novo, bairro: e.target.value })} />
          <Input placeholder="Cidade" value={novo.cidade} onChange={(e) => setNovo({ ...novo, cidade: e.target.value })} />
          <Input placeholder="Estado" value={novo.estado} onChange={(e) => setNovo({ ...novo, estado: e.target.value })} />
          <Button onClick={addAddr}><Plus className="mr-1 h-4 w-4" /> Adicionar</Button>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Trocar senha</h2>
        <Input type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder="Nova senha (mín. 6)" />
        <Button variant="outline" onClick={trocarSenha}>Atualizar senha</Button>
      </section>

      <Button
        variant="outline"
        className="w-full"
        onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/", replace: true }); }}
      >
        <LogOut className="mr-2 h-4 w-4" /> Sair
      </Button>
    </div>
  );
}
