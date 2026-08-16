import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Megaphone,
  Sparkles,
  Check,
  Clock,
  ShieldAlert,
  XCircle,
  Upload,
  Play,
  Image as ImageIcon,
  Link2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { validateImageFile } from "@/lib/upload-validation";
import { useMyEstab } from "@/hooks/use-my-estab";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/estabelecimento/anuncios")({
  component: AnunciosEstabPage,
});

type Plan = {
  id: string;
  nome: string;
  descricao: string | null;
  preco_cents: number;
  duracao_dias: number;
  prioridade: number;
  max_anuncios: number;
  destaque_home: boolean;
  destaque_categoria: boolean;
  destaque_busca: boolean;
  cor: string | null;
};

type Sub = {
  id: string;
  plan_id: string;
  status: string;
  preco_pago_cents: number;
  inicio_em: string | null;
  fim_em: string | null;
  metodo_pagamento: string | null;
  observacao: string | null;
  created_at: string;
  ad_plans: { nome: string; max_anuncios: number } | null;
};

type Campaign = {
  id: string;
  subscription_id: string | null;
  titulo: string;
  subtitulo: string | null;
  cta_texto: string | null;
  banner_path: string | null;
  imagem_url: string | null;
  video_url: string | null;
  destino_url: string | null;
  status: string;
  ativo: boolean;
  motivo_recusa: string | null;
  inicio_em: string | null;
  fim_em: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando aprovação",
  active: "Ativo",
  expired: "Expirado",
  cancelled: "Cancelado",
  rejected: "Recusado",
};

const CAMP_STATUS_LABEL: Record<string, string> = {
  pending: "Em análise",
  approved: "No ar",
  rejected: "Recusada",
};

function AnunciosEstabPage() {
  const { estab } = useMyEstab();
  const qc = useQueryClient();

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["ad_plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_plans")
        .select("*")
        .eq("ativo", true)
        .order("preco_cents");
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });

  const { data: subs = [] } = useQuery({
    queryKey: ["estab_ad_subs", estab?.id],
    enabled: !!estab?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estab_ad_subscriptions")
        .select("*, ad_plans(nome, max_anuncios)")
        .eq("establishment_id", estab!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Sub[];
    },
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ["estab_campaigns", estab?.id],
    enabled: !!estab?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sponsored_ads")
        .select(
          "id, subscription_id, titulo, subtitulo, cta_texto, banner_path, imagem_url, video_url, destino_url, status, ativo, motivo_recusa, inicio_em, fim_em, created_at",
        )
        .eq("establishment_id", estab!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Campaign[];
    },
  });

  const [pick, setPick] = useState<Plan | null>(null);
  const [metodo, setMetodo] = useState("pix");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  const ativo = subs.find((s) => s.status === "active");
  const maxCampanhas = ativo?.ad_plans?.max_anuncios ?? 0;
  const campsAtivas = campaigns.filter((c) => c.status !== "rejected").length;

  const [subirOpen, setSubirOpen] = useState(false);

  async function contratar() {
    if (!estab || !pick) return;
    setSaving(true);
    const { error } = await supabase.from("estab_ad_subscriptions").insert({
      establishment_id: estab.id,
      plan_id: pick.id,
      preco_pago_cents: pick.preco_cents,
      metodo_pagamento: metodo,
      observacao: obs || null,
      status: "pending",
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Solicitação enviada! Aguarde aprovação do admin.");
    setPick(null);
    setObs("");
    qc.invalidateQueries({ queryKey: ["estab_ad_subs", estab.id] });
  }

  async function cancelar(s: Sub) {
    if (!confirm("Cancelar esta assinatura?")) return;
    const { error } = await supabase
      .from("estab_ad_subscriptions")
      .update({ status: "cancelled" })
      .eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Cancelado");
    qc.invalidateQueries({ queryKey: ["estab_ad_subs", estab?.id] });
  }

  async function removerCamp(c: Campaign) {
    if (!confirm("Remover esta campanha?")) return;
    if (c.banner_path) await supabase.storage.from("ad-banners").remove([c.banner_path]);
    const { error } = await supabase.from("sponsored_ads").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Campanha removida");
    qc.invalidateQueries({ queryKey: ["estab_campaigns", estab?.id] });
    qc.invalidateQueries({ queryKey: ["ad_rotator"] });
  }

  if (!estab) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
          <Megaphone className="h-6 w-6 text-primary" /> Anúncios
        </h1>
        <p className="text-sm text-muted-foreground">
          Contrate um plano e ganhe destaque no app dos clientes.
        </p>
      </div>

      {ativo && (
        <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                <Sparkles className="h-4 w-4" /> Plano ativo: {ativo.ad_plans?.nome}
              </p>
              <p className="text-xs text-muted-foreground">
                Válido até {ativo.fim_em ? new Date(ativo.fim_em).toLocaleDateString("pt-BR") : "—"}{" "}
                · Pago {brl(ativo.preco_pago_cents)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Campanhas: <b>{campsAtivas}</b> / {maxCampanhas}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setSubirOpen(true)}
                disabled={campsAtivas >= maxCampanhas}
                className="gap-1.5"
              >
                <Upload className="h-4 w-4" />
                Subir campanha
              </Button>
              <Button variant="outline" size="sm" onClick={() => cancelar(ativo)}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {ativo && (
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Minhas campanhas
          </h2>
          {campaigns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Ainda sem campanha. Clique em <b>Subir campanha</b> para começar.
            </div>
          ) : (
            <div className="space-y-2">
              {campaigns.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4"
                >
                  <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    {c.video_url ? <Play className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{c.titulo}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.video_url ? "Vídeo" : "Banner"} · criado em{" "}
                      {new Date(c.created_at).toLocaleDateString("pt-BR")}
                    </p>
                    {c.status === "rejected" && c.motivo_recusa && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-rose-600">
                        <ShieldAlert className="h-3 w-3" /> {c.motivo_recusa}
                      </p>
                    )}
                  </div>
                  <Badge
                    className={cn(
                      c.status === "approved"
                        ? "bg-emerald-500 text-white"
                        : c.status === "pending"
                          ? "bg-amber-500 text-white"
                          : "bg-rose-500 text-white",
                    )}
                  >
                    {CAMP_STATUS_LABEL[c.status] ?? c.status}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => removerCamp(c)}>
                    <Trash2 className="h-4 w-4 text-rose-600" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Planos disponíveis
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isLoading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-64 animate-pulse rounded-2xl bg-muted" />
            ))}
          {plans.map((p) => (
            <div
              key={p.id}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: p.cor ?? "#FF6B00" }}
              />
              <h3 className="text-lg font-black">{p.nome}</h3>
              <p className="mt-1 line-clamp-2 min-h-10 text-xs text-muted-foreground">
                {p.descricao ?? "—"}
              </p>
              <div className="mt-3">
                <p className="text-3xl font-black text-primary">{brl(p.preco_cents)}</p>
                <p className="text-[11px] text-muted-foreground">
                  por {p.duracao_dias} dias · até {p.max_anuncios} anúncio(s)
                </p>
              </div>
              <ul className="mt-3 space-y-1 text-xs">
                {p.destaque_home && (
                  <li className="flex items-center gap-1.5 text-emerald-600">
                    <Check className="h-3.5 w-3.5" /> Destaque na Home
                  </li>
                )}
                {p.destaque_categoria && (
                  <li className="flex items-center gap-1.5 text-emerald-600">
                    <Check className="h-3.5 w-3.5" /> Destaque na Categoria
                  </li>
                )}
                {p.destaque_busca && (
                  <li className="flex items-center gap-1.5 text-emerald-600">
                    <Check className="h-3.5 w-3.5" /> Destaque na Busca
                  </li>
                )}
              </ul>
              <Button className="mt-4 w-full" onClick={() => setPick(p)} disabled={!!ativo}>
                {ativo ? "Já existe plano ativo" : "Contratar"}
              </Button>
            </div>
          ))}
          {!isLoading && plans.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              Nenhum plano disponível no momento.
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Minhas assinaturas
        </h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {subs.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Você ainda não contratou nenhum plano.
            </div>
          )}
          {subs.map((s, i) => (
            <div
              key={s.id}
              className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{s.ad_plans?.nome ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  <Clock className="mr-1 inline h-3 w-3" />
                  {s.status === "active" && s.fim_em
                    ? `até ${new Date(s.fim_em).toLocaleDateString("pt-BR")}`
                    : new Date(s.created_at).toLocaleDateString("pt-BR")}
                  {" · "}
                  {brl(s.preco_pago_cents)}
                </p>
                {s.observacao && s.status === "rejected" && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-rose-600">
                    <ShieldAlert className="h-3 w-3" /> {s.observacao}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={s.status === "active" ? "default" : "secondary"}
                  className={
                    s.status === "active"
                      ? "bg-emerald-500 text-white"
                      : s.status === "pending"
                        ? "bg-amber-500 text-white"
                        : s.status === "rejected"
                          ? "bg-rose-500 text-white"
                          : ""
                  }
                >
                  {STATUS_LABEL[s.status] ?? s.status}
                </Badge>
                {s.status === "pending" && (
                  <Button size="sm" variant="ghost" onClick={() => cancelar(s)}>
                    <XCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Modal contratar plano */}
      <Dialog open={!!pick} onOpenChange={(v) => !v && setPick(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contratar {pick?.nome}</DialogTitle>
          </DialogHeader>
          {pick && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-sm font-semibold">
                  {brl(pick.preco_cents)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    / {pick.duracao_dias} dias
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">{pick.descricao}</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Forma de pagamento</label>
                <Select value={metodo} onValueChange={setMetodo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">Pix</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="saldo">Descontar do saldo da carteira</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Observação (opcional)</label>
                <Textarea
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  placeholder="Ex.: preferência de horário, produto em destaque…"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Após confirmar, o admin analisa e ativa o plano.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPick(null)}>
              Cancelar
            </Button>
            <Button onClick={contratar} disabled={saving}>
              Confirmar contratação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Premium: Subir campanha */}
      <SubirCampanhaModal
        open={subirOpen}
        onOpenChange={setSubirOpen}
        estabId={estab.id}
        subscription={ativo ?? null}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["estab_campaigns", estab.id] });
          qc.invalidateQueries({ queryKey: ["ad_rotator"] });
        }}
      />
    </div>
  );
}

function SubirCampanhaModal({
  open,
  onOpenChange,
  estabId,
  subscription,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  estabId: string;
  subscription: Sub | null;
  onCreated: () => void;
}) {
  const [tipo, setTipo] = useState<"banner" | "video">("banner");
  const [titulo, setTitulo] = useState("");
  const [subtitulo, setSubtitulo] = useState("");
  const [ctaTexto, setCtaTexto] = useState("Ver oferta");
  const [destinoUrl, setDestinoUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setTipo("banner");
      setTitulo("");
      setSubtitulo("");
      setCtaTexto("Ver oferta");
      setDestinoUrl("");
      setVideoUrl("");
      setFile(null);
      setPreview(null);
    }
  }, [open]);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function submit() {
    if (!titulo.trim()) return toast.error("Dê um nome à campanha");
    if (!destinoUrl.trim()) return toast.error("Informe o link da promoção (URL de destino)");

    let banner_path: string | null = null;
    let video_url: string | null = null;

    if (tipo === "banner") {
      if (!file) return toast.error("Selecione a imagem do banner");
      if (file.size > 5 * 1024 * 1024) return toast.error("O banner deve ter no máximo 5 MB");
    } else {
      if (!videoUrl.trim()) return toast.error("Cole o link do YouTube (ou outra plataforma)");
      video_url = videoUrl.trim();
    }

    setSaving(true);
    try {
      if (tipo === "banner" && file) {
        const invalidBanner = validateImageFile(file);
        if (invalidBanner) {
          setSaving(false);
          return toast.error(invalidBanner);
        }
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${estabId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("ad-banners").upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });
        if (upErr) throw upErr;
        banner_path = path;
      }

      const inicio = subscription?.inicio_em ?? new Date().toISOString();
      const fim = subscription?.fim_em ?? null;

      const { error } = await supabase.from("sponsored_ads").insert({
        establishment_id: estabId,
        subscription_id: subscription?.id ?? null,
        titulo: titulo.trim(),
        subtitulo: subtitulo.trim() || null,
        cta_texto: ctaTexto.trim() || "Ver oferta",
        banner_path,
        video_url,
        destino_url: destinoUrl.trim(),
        status: "pending",
        ativo: true,
        patrocinado: true,
        prioridade: 0,
        inicio_em: inicio,
        fim_em: fim,
      });
      if (error) throw error;

      toast.success("Campanha enviada para aprovação!");
      onCreated();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao enviar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-primary" /> Subir campanha
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-5">
          {/* Tipo */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTipo("banner")}
              className={cn(
                "flex items-center gap-2 rounded-xl border-2 p-3 text-left transition",
                tipo === "banner"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40",
              )}
            >
              <ImageIcon
                className={cn(
                  "h-5 w-5",
                  tipo === "banner" ? "text-primary" : "text-muted-foreground",
                )}
              />
              <div>
                <p className="text-sm font-semibold">Banner (imagem)</p>
                <p className="text-[11px] text-muted-foreground">JPG/PNG até 5 MB</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setTipo("video")}
              className={cn(
                "flex items-center gap-2 rounded-xl border-2 p-3 text-left transition",
                tipo === "video"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40",
              )}
            >
              <Play
                className={cn(
                  "h-5 w-5",
                  tipo === "video" ? "text-primary" : "text-muted-foreground",
                )}
              />
              <div>
                <p className="text-sm font-semibold">Vídeo</p>
                <p className="text-[11px] text-muted-foreground">Link do YouTube</p>
              </div>
            </button>
          </div>

          {/* Campos comuns */}
          <div className="grid gap-3">
            <div>
              <Label>Nome da campanha *</Label>
              <Input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex.: Combo Duplo por R$ 29,90"
              />
            </div>
            <div>
              <Label>Chamada curta (opcional)</Label>
              <Input
                value={subtitulo}
                onChange={(e) => setSubtitulo(e.target.value)}
                placeholder="Ex.: Hambúrguer + batata + refri. Só hoje!"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Texto do botão</Label>
                <Input value={ctaTexto} onChange={(e) => setCtaTexto(e.target.value)} />
              </div>
              <div>
                <Label className="flex items-center gap-1">
                  <Link2 className="h-3.5 w-3.5" /> Link da promoção *
                </Label>
                <Input
                  value={destinoUrl}
                  onChange={(e) => setDestinoUrl(e.target.value)}
                  placeholder="https://... (a página que abre ao clicar)"
                />
              </div>
            </div>
          </div>

          {/* Mídia */}
          {tipo === "banner" ? (
            <div className="space-y-2">
              <Label>Imagem do banner</Label>
              <div className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-4">
                <div className="mb-3 flex items-start gap-3 rounded-lg bg-background/70 p-3 text-xs text-muted-foreground">
                  <ImageIcon className="h-5 w-5 shrink-0 text-primary" />
                  <div className="space-y-1">
                    <p>
                      <b>Tamanho exato:</b> 1200 × 630 pixels (proporção 16:9 — horizontal).
                    </p>
                    <p>
                      <b>Formato:</b> JPG ou PNG · até 5 MB.
                    </p>
                    <p>
                      <b>Dica:</b> deixe o texto principal no centro — as bordas podem ser cortadas
                      em telas menores.
                    </p>
                  </div>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={onPickFile}
                  className="block w-full text-sm"
                />
                {preview && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-border">
                    <img src={preview} alt="Prévia" className="h-40 w-full object-cover sm:h-56" />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Link do vídeo (YouTube)</Label>
              <Input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://youtu.be/... ou https://www.youtube.com/watch?v=..."
              />
              <div className="flex items-start gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                <Play className="h-5 w-5 shrink-0 text-primary" />
                <div className="space-y-1">
                  <p>
                    <b>Resolução recomendada:</b> 1920 × 1080 px (Full HD, 16:9 horizontal).
                  </p>
                  <p>
                    <b>Duração ideal:</b> 15 a 30 segundos — só os primeiros segundos serão exibidos
                    antes do rotador girar.
                  </p>
                  <p>
                    <b>Importante:</b> o vídeo toca automaticamente <b>sem som</b> e sem botão de
                    play. Evite vídeos verticais (Shorts) — eles ficam com bordas pretas.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p>
              <b>Como funciona:</b> ao aprovar, sua campanha entra no rotador de anúncios da Home e
              da aba Novidades. Cada anúncio fica visível por alguns segundos (configurado pelo
              admin) antes de girar para o próximo. Ao clicar, o cliente vai direto para o link da
              promoção.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving} className="gap-1.5">
            <Upload className="h-4 w-4" />
            {saving ? "Enviando..." : "Enviar para aprovação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
