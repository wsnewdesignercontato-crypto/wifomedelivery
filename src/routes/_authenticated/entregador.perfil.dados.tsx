import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMyCourier } from "@/hooks/use-courier";
import { savedProfileMessage } from "@/lib/profile-completion";
import {
  registrationChanges,
  saveCourierRegistration,
  type RegistrationSnapshot,
} from "@/lib/courier-registration";
import { notifyDataUpdated } from "@/lib/app-refresh";
import { isCheckoutPhone } from "@/lib/customer-access";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/entregador/perfil/dados")({
  head: () => ({
    meta: [
      { title: "Entregador — Perfil — Dados pessoais | PedeTrem" },
      { name: "description", content: "PedeTrem: entregador, perfil, dados pessoais." },
      { property: "og:title", content: "Entregador — Perfil — Dados pessoais | PedeTrem" },
      { property: "og:description", content: "PedeTrem: entregador, perfil, dados pessoais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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
  nome: "",
  foto_url: "",
  telefone: "",
  whatsapp: "",
  cpf: "",
  rg: "",
  nascimento: "",
  cnh: "",
  cnh_categoria: "",
  cnh_validade: "",
  pix_key: "",
  pix_tipo: "cpf",
  banco_nome: "",
  banco_agencia: "",
  banco_conta: "",
  banco_tipo: "corrente",
  banco_titular: "",
  contato_emergencia_nome: "",
  contato_emergencia_tel: "",
  cep: "",
  rua: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
};

const str = (v: unknown) => (typeof v === "string" ? v : "");

function Perfil() {
  const {
    courier,
    userId,
    isLoading,
    error: courierError,
    refetch: refetchCourier,
  } = useMyCourier();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [f, rawSetF] = useState<FormState>(EMPTY);
  const dirty = useRef(false);
  const baseline = useRef<{
    form: FormState;
    snapshot: RegistrationSnapshot;
    userId: string;
  } | null>(null);
  const activeUser = useRef(userId);
  activeUser.current = userId;
  const setF: typeof rawSetF = (next) => {
    dirty.current = true;
    rawSetF(next);
  };
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const lastCep = useRef("");

  async function buscarCep(rawCep: string) {
    const cep = rawCep.replace(/\D/g, "");
    if (cep.length !== 8 || lastCep.current === cep) return;
    lastCep.current = cep;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await res.json();
      if (d?.erro) {
        toast.error("CEP não encontrado");
        return;
      }
      setF((s) => ({
        ...s,
        rua: d.logradouro || s.rua,
        bairro: d.bairro || s.bairro,
        cidade: d.localidade || s.cidade,
        estado: (d.uf || s.estado || "").toUpperCase(),
        complemento: s.complemento || d.complemento || "",
      }));
      toast.success("Endereço preenchido pelo CEP");
    } catch {
      lastCep.current = "";
      toast.error("Não foi possível consultar o CEP");
    } finally {
      setCepLoading(false);
    }
  }

  // Nome fica na tabela profiles
  const profileQ = useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("nome, foto_url, telefone")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Seu cadastro não foi encontrado.");
      return data;
    },
    enabled: !!userId,
  });

  useEffect(() => {
    if (baseline.current?.userId !== userId) {
      dirty.current = false;
      baseline.current = null;
    }
    if (
      dirty.current ||
      isLoading ||
      profileQ.isLoading ||
      courierError ||
      profileQ.error ||
      !profileQ.data
    )
      return;
    const end = (courier?.endereco ?? {}) as Record<string, unknown>;
    const hydrated: FormState = {
      nome: profileQ.data?.nome ?? "",
      foto_url: courier?.foto_url ?? profileQ.data?.foto_url ?? "",
      telefone: courier?.telefone?.trim() || profileQ.data?.telefone || "",
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
    };
    baseline.current = { form: hydrated, snapshot: { profile: profileQ.data, courier }, userId };
    rawSetF(hydrated);
  }, [courier, profileQ.data, userId, isLoading, profileQ.isLoading, courierError, profileQ.error]);

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
      const up = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (up.error) throw up.error;
      const { data, error: signingError } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signingError || !data?.signedUrl)
        throw signingError ?? new Error("Não foi possível confirmar a foto enviada.");
      const url = data.signedUrl;
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
    if (!userId || saving || uploading || !baseline.current || baseline.current.userId !== userId)
      return;
    if (!f.nome.trim()) return toast.error("Informe seu nome.");
    if (f.telefone.trim() && !isCheckoutPhone(f.telefone))
      return toast.error("Informe um telefone com DDD.");
    setSaving(true);
    try {
      const changes = registrationChanges(f, baseline.current.form, baseline.current.snapshot);
      if (Object.keys(changes.patch).length === 0) {
        toast.success("Seus dados já estão salvos.");
        return;
      }
      const saved = await saveCourierRegistration(userId, changes.patch, changes.expected);
      await Promise.all([
        qc.cancelQueries({ queryKey: ["courier", userId] }),
        qc.cancelQueries({ queryKey: ["profile", userId] }),
      ]);
      qc.setQueryData(["profile", userId], saved.profile);
      qc.setQueryData(["courier", userId], saved.courier);
      if (activeUser.current === userId) dirty.current = false;
      toast.success(savedProfileMessage(saved.completion));
      notifyDataUpdated();
      window.dispatchEvent(new CustomEvent("wifome:profile-updated"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (courierError || profileQ.error)
    return (
      <div role="alert" className="space-y-3 p-6">
        <p>Não foi possível carregar seus dados salvos. Seu cadastro não foi apagado.</p>
        <Button onClick={() => void Promise.all([refetchCourier(), profileQ.refetch()])}>
          Tentar novamente
        </Button>
      </div>
    );

  if (isLoading || profileQ.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const initials = (f.nome || "EN")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <fieldset disabled={saving || uploading} className="mx-auto min-w-0 max-w-2xl space-y-5 pb-24">
      <div className="flex items-center gap-3">
        <Link
          to="/entregador/perfil"
          className="rounded-full border border-border p-2 hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-black">Meus dados</h1>
      </div>

      {/* Foto */}
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xl font-black text-primary">
            {f.foto_url ? (
              <img src={f.foto_url} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Foto de perfil</p>
            <p className="text-xs text-muted-foreground">JPG ou PNG até 5MB</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              ) : (
                <Upload className="mr-2 h-3 w-3" />
              )}
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
        <Field
          label="Data de nascimento"
          type="date"
          value={f.nascimento}
          onChange={(v) => setF({ ...f, nascimento: v })}
        />
      </Section>

      <Section title="Endereço e cidade de atuação">
        <div>
          <Label className="mb-1 block text-xs">CEP</Label>
          <div className="relative">
            <Input
              inputMode="numeric"
              placeholder="00000-000"
              value={f.cep}
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, "").slice(0, 8);
                const masked = d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
                setF((s) => ({ ...s, cep: masked }));
                if (d.length === 8) void buscarCep(d);
              }}
              onBlur={() => void buscarCep(f.cep)}
            />
            {cepLoading && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Preenchemos rua, bairro, cidade e UF automaticamente — você pode editar.
          </p>
        </div>
        <Field label="Rua" value={f.rua} onChange={(v) => setF({ ...f, rua: v })} />
        <Field label="Número" value={f.numero} onChange={(v) => setF({ ...f, numero: v })} />
        <Field
          label="Complemento"
          value={f.complemento}
          onChange={(v) => setF({ ...f, complemento: v })}
        />
        <Field label="Bairro" value={f.bairro} onChange={(v) => setF({ ...f, bairro: v })} />
        <Field
          label="Cidade (atuação)"
          value={f.cidade}
          onChange={(v) => setF({ ...f, cidade: v })}
        />
        <Field
          label="Estado (UF)"
          value={f.estado}
          onChange={(v) =>
            setF({
              ...f,
              estado: v
                .replace(/[^a-zA-Z]/g, "")
                .slice(0, 2)
                .toUpperCase(),
            })
          }
        />
      </Section>

      <Section title="CNH">
        <Field label="Número da CNH" value={f.cnh} onChange={(v) => setF({ ...f, cnh: v })} />
        <Field
          label="Categoria"
          value={f.cnh_categoria}
          onChange={(v) => setF({ ...f, cnh_categoria: v })}
        />
        <Field
          label="Validade"
          type="date"
          value={f.cnh_validade}
          onChange={(v) => setF({ ...f, cnh_validade: v })}
        />
      </Section>

      <Section title="PIX e Banco">
        <Field label="Chave PIX" value={f.pix_key} onChange={(v) => setF({ ...f, pix_key: v })} />
        <Field label="Tipo PIX" value={f.pix_tipo} onChange={(v) => setF({ ...f, pix_tipo: v })} />
        <Field label="Banco" value={f.banco_nome} onChange={(v) => setF({ ...f, banco_nome: v })} />
        <Field
          label="Agência"
          value={f.banco_agencia}
          onChange={(v) => setF({ ...f, banco_agencia: v })}
        />
        <Field
          label="Conta"
          value={f.banco_conta}
          onChange={(v) => setF({ ...f, banco_conta: v })}
        />
        <Field
          label="Titular"
          value={f.banco_titular}
          onChange={(v) => setF({ ...f, banco_titular: v })}
        />
      </Section>

      <Section title="Contato de emergência">
        <Field
          label="Nome"
          value={f.contato_emergencia_nome}
          onChange={(v) => setF({ ...f, contato_emergencia_nome: v })}
        />
        <Field
          label="Telefone"
          value={f.contato_emergencia_tel}
          onChange={(v) => setF({ ...f, contato_emergencia_tel: v })}
        />
      </Section>

      <div className="sticky bottom-4 z-10">
        <Button
          size="lg"
          className="w-full shadow-lg"
          onClick={salvar}
          disabled={saving || uploading}
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {saving ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </fieldset>
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
function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label htmlFor={`courier-${label}`} className="mb-1 block text-xs">
        {label}
      </Label>
      <Input
        id={`courier-${label}`}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
