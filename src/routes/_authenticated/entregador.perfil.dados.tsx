import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMyCourier } from "@/hooks/use-courier";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/entregador/perfil/dados")({
  component: Perfil,
});

type FormState = {
  nome: string;
  foto_url: string;
  telefone: string;
  whatsapp: string;
  cpf: string;
  rg: string;
  nascimento: string;
  cnh: string;
  cnh_categoria: string;
  cnh_validade: string;
  pix_key: string;
  pix_tipo: string;
  banco_nome: string;
  banco_agencia: string;
  banco_conta: string;
  banco_tipo: string;
  banco_titular: string;
  contato_emergencia_nome: string;
  contato_emergencia_tel: string;
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
};

const EMPTY: FormState = {
  nome: "", foto_url: "", telefone: "", whatsapp: "", cpf: "", rg: "", nascimento: "",
  cnh: "", cnh_categoria: "", cnh_validade: "",
  pix_key: "", pix_tipo: "cpf",
  banco_nome: "", banco_agencia: "", banco_conta: "", banco_tipo: "corrente", banco_titular: "",
  contato_emergencia_nome: "", contato_emergencia_tel: "",
  cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
};

const str = (v: unknown) => (typeof v === "string" ? v : "");

function Perfil() {
  const { courier, userId, isLoading } = useMyCourier();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Nome fica na tabela profiles
  const profileQ = useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("nome, foto_url, telefone").eq("id", userId).maybeSingle();
      return data;
    },
    enabled: !!userId,
  });

  useEffect(() => {
    if (!courier && !profileQ.data) return;
    const end = (courier?.endereco ?? {}) as Record<string, unknown>;
    setF({
      nome: profileQ.data?.nome ?? "",
      foto_url: courier?.foto_url ?? profileQ.data?.foto_url ?? "",
      telefone: courier?.telefone ?? profileQ.data?.telefone ?? "",
      whatsapp: courier?.whatsapp ?? "",
      cpf: courier?.cpf ?? "",
      rg: courier?.rg ?? "",
      nascimento: courier?.nascimento ?? "",
      cnh: courier?.cnh ?? "",
      cnh_categoria: courier?.cnh_categoria ?? "",
      cnh_validade: courier?.cnh_validade ?? "",
      pix_key: courier?.pix_key ?? "",
      pix_tipo: courier?.pix_tipo ?? "cpf",
      banco_nome: courier?.banco_nome ?? "",
      banco_agencia: courier?.banco_agencia ?? "",
      banco_conta: courier?.banco_conta ?? "",
      banco_tipo: courier?.banco_tipo ?? "corrente",
      banco_titular: courier?.banco_titular ?? "",
      contato_emergencia_nome: courier?.contato_emergencia_nome ?? "",
      contato_emergencia_tel: courier?.contato_emergencia_tel ?? "",
      cep: str(end.cep),
      rua: str(end.rua),
      numero: str(end.numero),
      complemento: str(end.complemento),
      bairro: str(end.bairro),
      cidade: courier?.cidade_atuacao ?? str(end.cidade),
      estado: str(end.estado),
    });
  }, [courier, profileQ.data]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 5MB)");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (up.error) throw up.error;
      const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
      const url = data?.signedUrl ?? "";
      setF((s) => ({ ...s, foto_url: url }));
      toast.success("Foto enviada");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao enviar imagem";
      toast.error(msg);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function salvar() {
    if (!userId) return;
    setSaving(true);
    try {
      // Atualiza profiles (nome + foto + telefone)
      const p = await supabase.from("profiles").update({
        nome: f.nome.trim(),
        foto_url: f.foto_url || null,
        telefone: f.telefone || null,
      }).eq("id", userId);
      if (p.error) throw p.error;

      // Upsert courier_profiles com todos os demais campos
      const c = await supabase.from("courier_profiles").upsert({
        user_id: userId,
        foto_url: f.foto_url || null,
        telefone: f.telefone || null,
        whatsapp: f.whatsapp || null,
        cpf: f.cpf || null,
        rg: f.rg || null,
        nascimento: f.nascimento || null,
        cnh: f.cnh || null,
        cnh_categoria: f.cnh_categoria || null,
        cnh_validade: f.cnh_validade || null,
        pix_key: f.pix_key || null,
        pix_tipo: f.pix_tipo || null,
        banco_nome: f.banco_nome || null,
        banco_agencia: f.banco_agencia || null,
        banco_conta: f.banco_conta || null,
        banco_tipo: f.banco_tipo || null,
        banco_titular: f.banco_titular || null,
        contato_emergencia_nome: f.contato_emergencia_nome || null,
        contato_emergencia_tel: f.contato_emergencia_tel || null,
      }, { onConflict: "user_id" });
      if (c.error) throw c.error;

      toast.success("Perfil atualizado com sucesso!");
      qc.invalidateQueries({ queryKey: ["courier", userId] });
      qc.invalidateQueries({ queryKey: ["profile", userId] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || profileQ.isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const initials = (f.nome || "EN").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-24">
      <div className="flex items-center gap-3">
        <Link to="/entregador/perfil" className="rounded-full border border-border p-2 hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-black">Meus dados</h1>
      </div>

      {/* Foto */}
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xl font-black text-primary">
            {f.foto_url ? <img src={f.foto_url} alt="" className="h-full w-full object-cover" /> : initials}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Foto de perfil</p>
            <p className="text-xs text-muted-foreground">JPG ou PNG até 5MB</p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Upload className="mr-2 h-3 w-3" />}
              {uploading ? "Enviando..." : "Trocar foto"}
            </Button>
          </div>
        </div>
      </section>

      <Section title="Dados pessoais">
        <Field label="Nome completo" value={f.nome} onChange={(v) => setF({ ...f, nome: v })} />
        <Field label="Telefone" value={f.telefone} onChange={(v) => setF({ ...f, telefone: v })} />
        <Field label="WhatsApp" value={f.whatsapp} onChange={(v) => setF({ ...f, whatsapp: v })} />
        <Field label="CPF" value={f.cpf} onChange={(v) => setF({ ...f, cpf: v })} />
        <Field label="RG" value={f.rg} onChange={(v) => setF({ ...f, rg: v })} />
        <Field label="Data de nascimento" type="date" value={f.nascimento} onChange={(v) => setF({ ...f, nascimento: v })} />
      </Section>

      <Section title="CNH">
        <Field label="Número" value={f.cnh} onChange={(v) => setF({ ...f, cnh: v })} />
        <Field label="Categoria" value={f.cnh_categoria} onChange={(v) => setF({ ...f, cnh_categoria: v })} />
        <Field label="Validade" type="date" value={f.cnh_validade} onChange={(v) => setF({ ...f, cnh_validade: v })} />
      </Section>

      <Section title="PIX e Banco">
        <Field label="Chave PIX" value={f.pix_key} onChange={(v) => setF({ ...f, pix_key: v })} />
        <Field label="Tipo PIX" value={f.pix_tipo} onChange={(v) => setF({ ...f, pix_tipo: v })} />
        <Field label="Banco" value={f.banco_nome} onChange={(v) => setF({ ...f, banco_nome: v })} />
        <Field label="Agência" value={f.banco_agencia} onChange={(v) => setF({ ...f, banco_agencia: v })} />
        <Field label="Conta" value={f.banco_conta} onChange={(v) => setF({ ...f, banco_conta: v })} />
        <Field label="Titular" value={f.banco_titular} onChange={(v) => setF({ ...f, banco_titular: v })} />
      </Section>

      <Section title="Contato de emergência">
        <Field label="Nome" value={f.contato_emergencia_nome} onChange={(v) => setF({ ...f, contato_emergencia_nome: v })} />
        <Field label="Telefone" value={f.contato_emergencia_tel} onChange={(v) => setF({ ...f, contato_emergencia_tel: v })} />
      </Section>

      <div className="sticky bottom-4 z-10">
        <Button size="lg" className="w-full shadow-lg" onClick={salvar} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {saving ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  );
}
function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return <div><Label className="mb-1 block text-xs">{label}</Label><Input type={type} value={value} onChange={(e) => onChange(e.target.value)} /></div>;
}
