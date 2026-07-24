import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Upload,
  Store,
  Phone,
  MapPin,
  Truck,
  Wallet,
  Palette,
  Save,
  ImageIcon,
  Sparkles,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useMyEstab } from "@/hooks/use-my-estab";
import type { Estab } from "@/hooks/use-estab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/estabelecimento/configuracoes")({
  component: ConfigPage,
});

type FormState = {
  nome: string;
  razao_social: string;
  descricao: string;
  slogan: string;
  telefone: string;
  whatsapp: string;
  endereco: string;
  cidade: string;
  cnpj: string;
  instagram: string;
  site: string;
  logo_url: string;
  capa_url: string;
  cor_destaque: string;
  taxa: string;
  tempo: string;
  minimo: string;
  pix_key: string;
  banco_nome: string;
  banco_agencia: string;
  banco_conta: string;
  banco_tipo: string;
  banco_titular: string;
  banco_documento: string;
};

const EMPTY: FormState = {
  nome: "", razao_social: "", descricao: "", slogan: "", telefone: "", whatsapp: "",
  endereco: "", cidade: "", cnpj: "", instagram: "", site: "",
  logo_url: "", capa_url: "", cor_destaque: "#FF6B00",
  taxa: "0.00", tempo: "30", minimo: "0.00",
  pix_key: "", banco_nome: "", banco_agencia: "", banco_conta: "", banco_tipo: "corrente",
  banco_titular: "", banco_documento: "",
};

function ConfigPage() {
  const { estab, userId } = useMyEstab();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCapa, setUploadingCapa] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const capaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!estab) return;
    setForm({
      nome: estab.nome,
      razao_social: estab.razao_social ?? "",
      descricao: estab.descricao ?? "",
      slogan: estab.slogan ?? "",
      telefone: estab.telefone ?? "",
      whatsapp: estab.whatsapp ?? "",
      endereco: estab.endereco ?? "",
      cidade: estab.cidade ?? "",
      cnpj: estab.cnpj ?? "",
      instagram: estab.instagram ?? "",
      site: estab.site ?? "",
      logo_url: estab.logo_url ?? "",
      capa_url: estab.capa_url ?? "",
      cor_destaque: estab.cor_destaque ?? "#FF6B00",
      taxa: (estab.taxa_entrega_cents / 100).toFixed(2),
      tempo: String(estab.tempo_medio_min ?? 30),
      minimo: (estab.pedido_minimo_cents / 100).toFixed(2),
      pix_key: estab.pix_key ?? "",
      banco_nome: estab.banco_nome ?? "",
      banco_agencia: estab.banco_agencia ?? "",
      banco_conta: estab.banco_conta ?? "",
      banco_tipo: estab.banco_tipo ?? "corrente",
      banco_titular: estab.banco_titular ?? "",
      banco_documento: estab.banco_documento ?? "",
    });
  }, [estab?.id]);

  async function uploadImage(file: File, kind: "logo" | "capa") {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem válida");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 5MB)");
      return;
    }
    const setUploading = kind === "logo" ? setUploadingLogo : setUploadingCapa;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/estab-${kind}-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("avatars").upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (up.error) throw up.error;
      const { data, error } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (error || !data) throw error ?? new Error("Falha ao gerar URL");
      setForm((s) => ({ ...s, [`${kind}_url`]: data.signedUrl }));
      toast.success(kind === "logo" ? "Logo enviada" : "Capa enviada");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  async function salvar() {
    if (!estab) return;
    if (!form.nome.trim()) return toast.error("Nome obrigatório");
    setSaving(true);
    const patch = {
      nome: form.nome.trim(),
      razao_social: form.razao_social || null,
      descricao: form.descricao || null,
      slogan: form.slogan || null,
      telefone: form.telefone || null,
      whatsapp: form.whatsapp || null,
      endereco: form.endereco || null,
      cidade: form.cidade || null,
      cnpj: form.cnpj || null,
      instagram: form.instagram || null,
      site: form.site || null,
      logo_url: form.logo_url || null,
      capa_url: form.capa_url || null,
      cor_destaque: form.cor_destaque || null,
      taxa_entrega_cents: Math.round(parseFloat(form.taxa || "0") * 100),
      tempo_medio_min: parseInt(form.tempo || "30"),
      pedido_minimo_cents: Math.round(parseFloat(form.minimo || "0") * 100),
      pix_key: form.pix_key || null,
      banco_nome: form.banco_nome || null,
      banco_agencia: form.banco_agencia || null,
      banco_conta: form.banco_conta || null,
      banco_tipo: form.banco_tipo || null,
      banco_titular: form.banco_titular || null,
      banco_documento: form.banco_documento || null,
    };
    const { data, error } = await supabase
      .from("establishments")
      .update(patch)
      .eq("id", estab.id)
      .select("*")
      .single();
    setSaving(false);
    if (error) return toast.error("Falha ao salvar");
    toast.success("Configurações salvas ✨");
    if (data) qc.setQueryData(["myEstab", userId], data as unknown as Estab);
  }

  if (!estab) return null;

  const initials = (form.nome || "LOJA")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-32">
      {/* Header premium com preview de capa e logo */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div
          className="relative h-40 w-full"
          style={{
            background: form.capa_url
              ? `url(${form.capa_url}) center/cover`
              : `linear-gradient(135deg, ${form.cor_destaque}, ${form.cor_destaque}99)`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
          <button
            type="button"
            onClick={() => capaRef.current?.click()}
            disabled={uploadingCapa}
            className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white backdrop-blur transition hover:bg-black/70"
          >
            {uploadingCapa ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
            {uploadingCapa ? "Enviando…" : "Trocar capa"}
          </button>
          <input
            ref={capaRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadImage(f, "capa");
              e.target.value = "";
            }}
          />
        </div>

        <div className="flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end">
          <div className="-mt-12 flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-card bg-primary/10 text-2xl font-black text-primary shadow-lg">
            {form.logo_url ? (
              <img src={form.logo_url} alt="Logo" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-2xl font-black tracking-tight">
              {form.nome || "Sua loja"}
            </h1>
            {form.slogan && <p className="truncate text-sm text-muted-foreground">{form.slogan}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                ref={logoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadImage(f, "logo");
                  e.target.value = "";
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => logoRef.current?.click()}
                disabled={uploadingLogo}
              >
                {uploadingLogo ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                )}
                {uploadingLogo ? "Enviando…" : "Trocar logo"}
              </Button>
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3" /> JPG/PNG até 5MB
              </span>
            </div>
          </div>
        </div>
      </section>

      <Section icon={Store} title="Identidade" subtitle="Como sua loja aparece no app">
        <Field label="Nome público" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} full />
        <Field label="Razão social" value={form.razao_social} onChange={(v) => setForm({ ...form, razao_social: v })} />
        <Field label="Slogan" value={form.slogan} onChange={(v) => setForm({ ...form, slogan: v })} />
        <div className="md:col-span-2">
          <Label className="mb-1 block text-xs">Descrição</Label>
          <Textarea
            rows={3}
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            placeholder="Conte para os clientes o que sua loja tem de especial"
          />
        </div>
        <div className="md:col-span-2">
          <Label className="mb-1 flex items-center gap-1.5 text-xs">
            <Palette className="h-3.5 w-3.5" /> Cor de destaque
          </Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.cor_destaque}
              onChange={(e) => setForm({ ...form, cor_destaque: e.target.value })}
              className="h-11 w-16 cursor-pointer rounded-lg border border-input bg-background"
            />
            <Input
              value={form.cor_destaque}
              onChange={(e) => setForm({ ...form, cor_destaque: e.target.value })}
              className="max-w-[140px] font-mono"
            />
            <div
              className="h-11 flex-1 rounded-lg border border-border"
              style={{
                background: `linear-gradient(135deg, ${form.cor_destaque}, ${form.cor_destaque}80)`,
              }}
            />
          </div>
        </div>
      </Section>

      <Section icon={Phone} title="Contato" subtitle="Canais de atendimento">
        <Field label="Telefone" value={form.telefone} onChange={(v) => setForm({ ...form, telefone: v })} />
        <Field label="WhatsApp" value={form.whatsapp} onChange={(v) => setForm({ ...form, whatsapp: v })} />
        <Field label="Instagram" value={form.instagram} onChange={(v) => setForm({ ...form, instagram: v })} />
        <Field label="Site" value={form.site} onChange={(v) => setForm({ ...form, site: v })} />
      </Section>

      <Section icon={MapPin} title="Endereço" subtitle="Onde sua loja está localizada">
        <Field label="Endereço" value={form.endereco} onChange={(v) => setForm({ ...form, endereco: v })} full />
        <Field label="Cidade" value={form.cidade} onChange={(v) => setForm({ ...form, cidade: v })} />
        <Field label="CNPJ" value={form.cnpj} onChange={(v) => setForm({ ...form, cnpj: v })} />
      </Section>

      <Section icon={Truck} title="Operação" subtitle="Taxas e prazos padrão">
        <Field
          label="Taxa de entrega (R$)"
          type="number"
          value={form.taxa}
          onChange={(v) => setForm({ ...form, taxa: v })}
        />
        <Field
          label="Pedido mínimo (R$)"
          type="number"
          value={form.minimo}
          onChange={(v) => setForm({ ...form, minimo: v })}
        />
        <Field
          label="Tempo médio (min)"
          type="number"
          value={form.tempo}
          onChange={(v) => setForm({ ...form, tempo: v })}
        />
      </Section>

      <Section icon={Wallet} title="Recebimento" subtitle="Onde vamos depositar seus repasses">
        <Field label="Chave PIX" value={form.pix_key} onChange={(v) => setForm({ ...form, pix_key: v })} full />
        <Field label="Banco" value={form.banco_nome} onChange={(v) => setForm({ ...form, banco_nome: v })} />
        <div>
          <Label className="mb-1 block text-xs">Tipo de conta</Label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={form.banco_tipo}
            onChange={(e) => setForm({ ...form, banco_tipo: e.target.value })}
          >
            <option value="corrente">Corrente</option>
            <option value="poupanca">Poupança</option>
          </select>
        </div>
        <Field label="Agência" value={form.banco_agencia} onChange={(v) => setForm({ ...form, banco_agencia: v })} />
        <Field label="Conta" value={form.banco_conta} onChange={(v) => setForm({ ...form, banco_conta: v })} />
        <Field label="Titular" value={form.banco_titular} onChange={(v) => setForm({ ...form, banco_titular: v })} />
        <Field label="CPF/CNPJ titular" value={form.banco_documento} onChange={(v) => setForm({ ...form, banco_documento: v })} />
      </Section>

      <div className="sticky bottom-4 z-10">
        <Button size="lg" className="w-full shadow-lg" onClick={salvar} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {saving ? "Salvando…" : "Salvar todas as alterações"}
        </Button>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Store;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <header className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="font-semibold leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </header>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  full?: boolean;
}) {
  return (
    <div className={full ? "md:col-span-2" : undefined}>
      <Label className="mb-1 block text-xs">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
