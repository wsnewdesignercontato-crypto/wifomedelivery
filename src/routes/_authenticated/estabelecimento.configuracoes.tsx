import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Eye,
  Landmark,
  Loader2,
  ImageIcon,
  MapPin,
  Palette,
  Phone,
  Save,
  Sparkles,
  Store,
  TimerReset,
  Truck,
  Upload,
  Wallet,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useMyEstab } from "@/hooks/use-my-estab";
import type { Estab } from "@/hooks/use-estab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { PushToggleCard } from "@/components/push-toggle-card";

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

const money = (value: string) =>
  Number(value || "0").toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

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
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estab?.id]);

  // Sync UF/cidade/endereço vindos do banco sem sobrescrever edições em andamento
  useEffect(() => {
    if (!estab) return;
    setForm((prev) => ({
      ...prev,
      estado: prev.estado || (estab.estado ?? ""),
      cidade: prev.cidade || (estab.cidade ?? ""),
      endereco: prev.endereco || (estab.endereco ?? ""),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estab?.estado, estab?.cidade, estab?.endereco]);

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
      estado: form.estado ? form.estado.trim().toUpperCase().slice(0, 2) : null,
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
    if (data) qc.setQueryData(["myEstab", userId], data as unknown as Estab);
    qc.invalidateQueries({ queryKey: ["myEstab", userId] });
    window.dispatchEvent(new Event("wifome:profile-updated"));
    toast.success("Configurações salvas ✨");
  }

  const setupItems = useMemo(
    () => [
      {
        label: "Identidade visual",
        ready: Boolean(form.nome.trim() && form.logo_url && form.capa_url),
      },
      {
        label: "Descricao comercial",
        ready: Boolean(form.descricao.trim() && form.slogan.trim()),
      },
      {
        label: "Contato e endereco",
        ready: Boolean(
          form.telefone.trim() &&
          form.whatsapp.trim() &&
          form.endereco.trim() &&
          form.cidade.trim() &&
          form.estado.trim(),
        ),
      },
      {
        label: "Regras operacionais",
        ready: Boolean(form.taxa.trim() && form.minimo.trim() && Number(form.tempo) > 0),
      },
      {
        label: "Recebimento",
        ready: Boolean(
          form.pix_key.trim() ||
          (form.banco_nome.trim() &&
            form.banco_conta.trim() &&
            form.banco_titular.trim() &&
            form.banco_documento.trim()),
        ),
      },
    ],
    [
      form.capa_url,
      form.cidade,
      form.descricao,
      form.endereco,
      form.estado,
      form.logo_url,
      form.minimo,
      form.nome,
      form.pix_key,
      form.slogan,
      form.taxa,
      form.telefone,
      form.tempo,
      form.whatsapp,
      form.banco_conta,
      form.banco_documento,
      form.banco_nome,
      form.banco_titular,
    ],
  );

  const setupPct = Math.round(
    (setupItems.filter((item) => item.ready).length / setupItems.length) * 100,
  );

  if (!estab) return null;

  const initials = (form.nome || "LOJA")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-32">
      <section className="card-premium relative overflow-hidden border-none bg-gradient-to-br from-primary/12 via-white to-primary/5 p-5 dark:from-primary/15 dark:via-card dark:to-primary/10 sm:p-6">
        <div className="absolute -left-10 top-0 h-36 w-36 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -right-10 bottom-0 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative grid gap-6 xl:grid-cols-[1.1fr_0.9fr] xl:items-start">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary text-primary-foreground">Controle premium</Badge>
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                Cliente, entregador e financeiro
              </Badge>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-muted-foreground">
                Edite a identidade da loja e as informacoes operacionais em um unico painel.
              </p>
              <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
                A base que organiza a experiencia dos 3 aplicativos.
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                O cliente enxerga marca, frete e prazo. O motorista depende de endereco e contato. O
                financeiro usa PIX e conta para repasse.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <HeroStat label="Perfil completo" value={`${setupPct}%`} hint="Checklist da loja" />
              <HeroStat label="Frete base" value={money(form.taxa)} hint="Visivel ao cliente" />
              <HeroStat label="Pedido minimo" value={money(form.minimo)} hint="Regra comercial" />
              <HeroStat
                label="Tempo medio"
                value={`${form.tempo || "30"} min`}
                hint="Promessa operacional"
              />
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-card backdrop-blur dark:border-border dark:bg-card/90">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-muted-foreground">
                  Prontidao da operacao
                </p>
                <p className="mt-2 text-3xl font-black tracking-tight text-foreground">
                  {setupPct}%
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
            </div>

            <p className="mt-3 text-sm text-muted-foreground">
              Complete os pontos abaixo para deixar marca, entregas e repasses redondos.
            </p>

            <div className="mt-4">
              <Progress value={setupPct} className="h-2.5" />
            </div>

            <div className="mt-4 space-y-3">
              {setupItems.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/80 px-3 py-2.5"
                >
                  <span className="text-sm font-semibold text-foreground">{item.label}</span>
                  <Badge
                    variant="secondary"
                    className={
                      item.ready
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {item.ready ? "Pronto" : "Ajustar"}
                  </Badge>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-3">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                <CheckCircle2 className="h-3.5 w-3.5" />O que mais pesa
              </p>
              <p className="mt-1 text-sm text-foreground">
                Logo, capa, descricao, prazo, frete e PIX sao os campos que mais influenciam a
                percepcao premium da loja.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="card-premium overflow-hidden rounded-[1.75rem] border-none bg-gradient-to-br from-card to-muted/20">
          <div
            className="relative h-40"
            style={{
              background: form.capa_url
                ? `url(${form.capa_url}) center/cover`
                : `linear-gradient(135deg, ${form.cor_destaque}, ${form.cor_destaque}99)`,
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
            <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-black/45 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
              <Eye className="h-3.5 w-3.5" />
              Como o cliente enxerga
            </div>
          </div>

          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[1.5rem] border border-border/70 bg-background text-xl font-black text-primary">
              {form.logo_url ? (
                <img
                  src={form.logo_url}
                  alt="Logo"
                  className="h-full w-full object-contain p-1.5"
                />
              ) : (
                initials
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="truncate text-2xl font-black tracking-tight text-foreground">
                {form.nome || "Sua loja"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {form.slogan || "Seu slogan aparece aqui para valorizar a marca."}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                {form.descricao ||
                  "Uma boa descricao ajuda o cliente a confiar mais e comprar mais rapido."}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <AudienceChip icon={Truck} label={`Frete ${money(form.taxa)}`} />
                <AudienceChip icon={TimerReset} label={`${form.tempo || "30"} min`} />
                <AudienceChip icon={Store} label={`Minimo ${money(form.minimo)}`} />
              </div>
            </div>
          </div>
        </section>

        <div className="space-y-4">
          <PushToggleCard />

          <section className="card-premium rounded-[1.75rem] border-none bg-gradient-to-br from-card to-muted/20 p-5">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-muted-foreground">
                  Impacto por app
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground">
                  O que cada lado precisa ver
                </h2>
              </div>

              <AudienceInsight
                icon={Eye}
                title="Cliente"
                desc="Descricao, capa, prazo e ticket minimo elevam conversao e confianca."
                ready={Boolean(form.descricao.trim() && form.capa_url && form.tempo.trim())}
              />
              <AudienceInsight
                icon={MapPin}
                title="Entregador"
                desc="Endereco, cidade, WhatsApp e tempo medio deixam a operacao mais clara."
                ready={Boolean(
                  form.endereco.trim() &&
                  form.cidade.trim() &&
                  form.whatsapp.trim() &&
                  Number(form.tempo) > 0,
                )}
              />
              <AudienceInsight
                icon={Landmark}
                title="Financeiro"
                desc="PIX e dados bancarios reduzem atrito nos repasses da loja."
                ready={Boolean(
                  form.pix_key.trim() ||
                  (form.banco_nome.trim() &&
                    form.banco_conta.trim() &&
                    form.banco_titular.trim() &&
                    form.banco_documento.trim()),
                )}
              />
            </div>
          </section>
        </div>
      </div>

      {/* Header premium com preview de capa e logo */}
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
        <Button size="lg" className="w-full shadow-lg" onClick={salvar} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
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

function HeroStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-border dark:bg-card/80">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function AudienceChip({ icon: Icon, label }: { icon: typeof Truck; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground">
      <Icon className="h-3.5 w-3.5 text-primary" />
      {label}
    </span>
  );
}

function AudienceInsight({
  icon: Icon,
  title,
  desc,
  ready,
}: {
  icon: typeof Eye;
  title: string;
  desc: string;
  ready: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
          </div>
        </div>
        <Badge
          variant="secondary"
          className={
            ready
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "bg-muted text-muted-foreground"
          }
        >
          {ready ? "OK" : "Pendente"}
        </Badge>
      </div>
    </div>
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
