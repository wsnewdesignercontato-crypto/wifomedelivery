import { StoreLocationEditor } from "@/components/store-location-editor";
import { useNicheCatalog } from "@/hooks/use-niche-catalog";
import { confirmProfileSaved, savedProfileMessage } from "@/lib/profile-completion";
import { isCheckoutPhone } from "@/lib/customer-access";
import { ESTABLISHMENT_SELECT } from "@/lib/data-access";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImageUploadGuidance } from "@/components/image-upload-guidance";
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
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useMyEstab } from "@/hooks/use-my-estab";
import type { Estab } from "@/hooks/use-estab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PushToggleCard } from "@/components/push-toggle-card";

export const Route = createFileRoute("/_authenticated/estabelecimento/configuracoes")({
  head: () => ({
    meta: [
      { title: "Loja — Configurações | PedeTrem" },
      { name: "description", content: "PedeTrem: loja, configurações." },
      { property: "og:title", content: "Loja — Configurações | PedeTrem" },
      { property: "og:description", content: "PedeTrem: loja, configurações." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConfigPage,
});

type FormState = {
  categoria_id: string;
  nome: string;
  razao_social: string;
  descricao: string;
  slogan: string;
  telefone: string;
  whatsapp: string;
  endereco: string;
  cidade: string;
  estado: string;
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
  categoria_id: "",
  nome: "",
  razao_social: "",
  descricao: "",
  slogan: "",
  telefone: "",
  whatsapp: "",
  endereco: "",
  cidade: "",
  estado: "",
  cnpj: "",
  instagram: "",
  site: "",
  logo_url: "",
  capa_url: "",
  cor_destaque: "#FF6B00",
  taxa: "0.00",
  tempo: "30",
  minimo: "0.00",
  pix_key: "",
  banco_nome: "",
  banco_agencia: "",
  banco_conta: "",
  banco_tipo: "corrente",
  banco_titular: "",
  banco_documento: "",
};

function ConfigPage() {
  const { estab, userId } = useMyEstab();
  const qc = useQueryClient();
  const { data: niches = [], isError: nicheError } = useNicheCatalog();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCapa, setUploadingCapa] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const capaRef = useRef<HTMLInputElement>(null);

  const baselineForm = useRef<FormState | null>(null);
  const baselineRow = useRef<Estab | null>(null);
  const busy = useRef(false);
  const initializedId = useRef<string | null>(null);
  useEffect(() => {
    if (!estab || initializedId.current === estab.id) return;
    initializedId.current = estab.id;
    const loaded = {
      categoria_id: estab.categoria_id ?? "",
      nome: estab.nome,
      razao_social: estab.razao_social ?? "",
      descricao: estab.descricao ?? "",
      slogan: estab.slogan ?? "",
      telefone: estab.telefone ?? "",
      whatsapp: estab.whatsapp ?? "",
      endereco: estab.endereco ?? "",
      cidade: estab.cidade ?? "",
      estado: estab.estado ?? "",
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
    };
    baselineForm.current = loaded;
    baselineRow.current = estab;
    setForm(loaded);
  }, [estab]);

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
    if (!estab || busy.current || uploadingLogo || uploadingCapa) return;
    if (!form.nome.trim()) return toast.error("Nome obrigatório");
    if (form.telefone.trim() && !isCheckoutPhone(form.telefone))
      return toast.error("Informe um telefone da loja com DDD.");
    const taxa = Number(form.taxa.replace(",", "."));
    const minimo = Number(form.minimo.replace(",", "."));
    const tempo = Number(form.tempo);
    if (
      ![taxa, minimo].every((n) => Number.isFinite(n) && n >= 0 && n <= 1000000) ||
      !Number.isInteger(tempo) ||
      tempo < 1 ||
      tempo > 1440
    )
      return toast.error("Confira taxa, pedido mínimo e tempo de preparo.");
    busy.current = true;
    setSaving(true);
    try {
      const values = {
        categoria_id: form.categoria_id || null,
        nome: form.nome.trim(),
        razao_social: form.razao_social || null,
        descricao: form.descricao || null,
        slogan: form.slogan || null,
        telefone: form.telefone || null,
        whatsapp: form.whatsapp || null,
        endereco: form.endereco || null,
        cidade: form.cidade || null,
        estado: form.estado ? form.estado.trim().toUpperCase().slice(0, 2) : null,
        cnpj: form.cnpj || null,
        instagram: form.instagram || null,
        site: form.site || null,
        logo_url: form.logo_url || null,
        capa_url: form.capa_url || null,
        cor_destaque: form.cor_destaque || null,
        taxa_entrega_cents: Math.round(taxa * 100),
        tempo_medio_min: tempo,
        pedido_minimo_cents: Math.round(minimo * 100),
        pix_key: form.pix_key || null,
        banco_nome: form.banco_nome || null,
        banco_agencia: form.banco_agencia || null,
        banco_conta: form.banco_conta || null,
        banco_tipo: form.banco_tipo || null,
        banco_titular: form.banco_titular || null,
        banco_documento: form.banco_documento || null,
      };
      // Only write edited fields. The snapshot belongs to the form, not a
      // later background refetch, so concurrent changes cannot be overwritten.
      const patch: Partial<typeof values> & { lat?: null; lng?: null } = {};
      const formKeys: Record<string, keyof FormState> = {
        taxa_entrega_cents: "taxa",
        tempo_medio_min: "tempo",
        pedido_minimo_cents: "minimo",
      };
      for (const key of Object.keys(values) as (keyof typeof values)[]) {
        const field = formKeys[key] ?? (key as keyof FormState);
        if (form[field] !== baselineForm.current?.[field])
          Object.assign(patch, { [key]: values[key] });
      }
      if (["endereco", "cidade", "estado"].some((key) => key in patch))
        Object.assign(patch, { lat: null, lng: null });
      if (!Object.keys(patch).length) {
        toast.success("Os dados já estão salvos.");
        return;
      }
      let query = supabase
        .from("establishments")
        .update(patch)
        .eq("id", estab.id)
        .eq("owner_id", userId);
      const privateFields = new Set([
        "cnpj",
        "pix_key",
        "banco_nome",
        "banco_agencia",
        "banco_conta",
        "banco_tipo",
        "banco_titular",
        "banco_documento",
      ]);
      for (const key of Object.keys(patch)) {
        // Private columns are readable only through the ownership-scoped RPC.
        // Keep those grants restricted; never add a REST SELECT just to save.
        if (privateFields.has(key) || key === "lat" || key === "lng") continue;
        const previous = baselineRow.current?.[key as keyof Estab];
        if (previous === null || previous === undefined) query = query.is(key, null);
        else query = query.eq(key, previous);
      }
      const { data, error } = await query.select(ESTABLISHMENT_SELECT).single();
      if (error || !data)
        throw (
          error ?? new Error("A loja não foi atualizada. Confira alterações feitas em outra tela.")
        );
      await qc.cancelQueries({ queryKey: ["myEstab", userId] });
      // Public columns come from the database response; private fields are the
      // confirmed write merged into the last snapshot, never default blanks.
      const saved = { ...estab, ...patch, ...data } as Estab;
      baselineRow.current = saved;
      baselineForm.current = { ...form };
      qc.setQueryData(["myEstab", userId], saved);
      qc.invalidateQueries({ queryKey: ["myEstab", userId] });
      const completion = await confirmProfileSaved(userId, "estabelecimento");
      toast.success(savedProfileMessage(completion));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a loja.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  if (!estab) return null;

  const initials = (form.nome || "LOJA")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <fieldset
      disabled={saving || uploadingLogo || uploadingCapa}
      className="mx-auto min-w-0 max-w-3xl space-y-6 pb-32"
    >
      <PushToggleCard operationalSound />
      {/* Header com preview de capa e logo */}
      <section className="relative rounded-3xl border border-border bg-card shadow-sm">
        <div
          className="relative h-40 w-full overflow-hidden rounded-t-3xl"
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
            aria-describedby="store-cover-help"
            disabled={uploadingCapa}
            className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white backdrop-blur transition hover:bg-black/70"
          >
            {uploadingCapa ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5" />
            )}
            {uploadingCapa ? "Enviando…" : "Trocar capa"}
          </button>
          <input
            ref={capaRef}
            type="file"
            accept="image/*"
            aria-describedby="store-cover-help"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadImage(f, "capa");
              e.target.value = "";
            }}
          />
        </div>

        <div className="relative flex flex-col items-center gap-4 px-6 pb-6 text-center sm:flex-row sm:items-end sm:text-left">
          <div className="relative z-10 -mt-16 flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-card bg-background text-2xl font-black text-primary shadow-xl ring-1 ring-border">
            {form.logo_url ? (
              <img src={form.logo_url} alt="Logo" className="h-full w-full object-contain p-1.5" />
            ) : (
              initials
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-2xl font-black tracking-tight">
              {form.nome || "Sua loja"}
            </h1>
            {form.slogan && <p className="truncate text-sm text-muted-foreground">{form.slogan}</p>}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <input
                ref={logoRef}
                type="file"
                accept="image/*"
                aria-describedby="store-logo-help"
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
                aria-describedby="store-logo-help"
                disabled={uploadingLogo}
              >
                {uploadingLogo ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                )}
                {uploadingLogo ? "Enviando…" : "Trocar logo"}
              </Button>
            </div>
            <ImageUploadGuidance
              id="store-logo-help"
              profile="logo"
              formatPolicy="any-image"
              className="mt-2"
            />
          </div>
        </div>
        <div className="px-6 pb-6">
          <p className="text-xs font-medium">Capa da loja</p>
          <ImageUploadGuidance id="store-cover-help" profile="cover" formatPolicy="any-image" />
        </div>
      </section>

      <Section icon={Store} title="Identidade" subtitle="Como sua loja aparece no app">
        <div className="md:col-span-2">
          <Label htmlFor="store-niche" className="mb-1 block text-xs">
            Segmento da loja
          </Label>
          <select
            id="store-niche"
            value={form.categoria_id}
            onChange={(event) => setForm({ ...form, categoria_id: event.target.value })}
            className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
          >
            <option value="">Selecione o segmento</option>
            {niches.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            {nicheError
              ? "Não foi possível carregar os segmentos. Tente atualizar a página."
              : "Ajuda o cliente a encontrar sua loja e orienta os modelos disponíveis em Categorias."}
          </p>
        </div>
        <Field
          label="Nome público"
          value={form.nome}
          onChange={(v) => setForm({ ...form, nome: v })}
          full
        />
        <Field
          label="Razão social"
          value={form.razao_social}
          onChange={(v) => setForm({ ...form, razao_social: v })}
        />
        <Field
          label="Slogan"
          value={form.slogan}
          onChange={(v) => setForm({ ...form, slogan: v })}
        />
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
        <Field
          label="Telefone"
          value={form.telefone}
          onChange={(v) => setForm({ ...form, telefone: v })}
        />
        <Field
          label="WhatsApp"
          value={form.whatsapp}
          onChange={(v) => setForm({ ...form, whatsapp: v })}
        />
        <Field
          label="Instagram"
          value={form.instagram}
          onChange={(v) => setForm({ ...form, instagram: v })}
        />
        <Field label="Site" value={form.site} onChange={(v) => setForm({ ...form, site: v })} />
      </Section>

      <Section icon={MapPin} title="Endereço" subtitle="Onde sua loja está localizada">
        <Field
          label="Endereço"
          value={form.endereco}
          onChange={(v) => setForm({ ...form, endereco: v })}
          full
        />
        <Field
          label="Cidade"
          value={form.cidade}
          onChange={(v) => setForm({ ...form, cidade: v })}
        />
        <Field
          label="Estado (UF)"
          value={form.estado}
          onChange={(v) => setForm({ ...form, estado: v.toUpperCase().slice(0, 2) })}
        />
        <Field
          label="CNPJ"
          value={form.cnpj}
          onChange={(v) => setForm({ ...form, cnpj: v })}
          full
        />
      </Section>

      <div className="rounded-2xl border bg-card p-4">
        <h2 className="text-base font-semibold">Ponto de coleta no mapa</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Defina onde o entregador deve buscar os pedidos.
        </p>
        <StoreLocationEditor store={estab} />
      </div>

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
        <Field
          label="Chave PIX"
          value={form.pix_key}
          onChange={(v) => setForm({ ...form, pix_key: v })}
          full
        />
        <Field
          label="Banco"
          value={form.banco_nome}
          onChange={(v) => setForm({ ...form, banco_nome: v })}
        />
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
        <Field
          label="Agência"
          value={form.banco_agencia}
          onChange={(v) => setForm({ ...form, banco_agencia: v })}
        />
        <Field
          label="Conta"
          value={form.banco_conta}
          onChange={(v) => setForm({ ...form, banco_conta: v })}
        />
        <Field
          label="Titular"
          value={form.banco_titular}
          onChange={(v) => setForm({ ...form, banco_titular: v })}
        />
        <Field
          label="CPF/CNPJ titular"
          value={form.banco_documento}
          onChange={(v) => setForm({ ...form, banco_documento: v })}
        />
      </Section>

      <div className="sticky bottom-4 z-10">
        <Button
          size="lg"
          className="w-full shadow-lg"
          onClick={salvar}
          disabled={saving || uploadingLogo || uploadingCapa}
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {saving ? "Salvando…" : "Salvar todas as alterações"}
        </Button>
      </div>
    </fieldset>
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
