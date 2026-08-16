import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Trash2, Megaphone, Pencil, Check, X, Play, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/anuncios")({
  component: AnunciosPage,
});

type Ad = {
  id: string;
  establishment_id: string | null;
  titulo: string;
  subtitulo: string | null;
  imagem_url: string | null;
  banner_path: string | null;
  video_url: string | null;
  destino_url: string | null;
  cta_texto: string;
  ativo: boolean;
  patrocinado: boolean;
  prioridade: number;
  duracao_segundos: number;
  status: string;
  motivo_recusa: string | null;
  inicio_em: string | null;
  fim_em: string | null;
  establishments?: { nome: string } | null;
};

type Estab = { id: string; nome: string };

const empty = {
  establishment_id: "",
  titulo: "",
  subtitulo: "",
  imagem_url: "",
  video_url: "",
  destino_url: "",
  cta_texto: "Ver mais",
  ativo: true,
  patrocinado: true,
  prioridade: 0,
  duracao_segundos: 6,
  inicio_em: "",
  fim_em: "",
};

async function fetchAds(): Promise<Ad[]> {
  const { data, error } = await supabase
    .from("sponsored_ads")
    .select("*, establishments(nome)")
    .order("prioridade", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Ad[];
}

async function fetchEstabs(): Promise<Estab[]> {
  const { data, error } = await supabase.from("establishments").select("id, nome").order("nome");
  if (error) throw error;
  return (data ?? []) as Estab[];
}

function AdThumb({ ad }: { ad: Ad }) {
  const [signed, setSigned] = useState<string | null>(null);
  useEffect(() => {
    if (!ad.banner_path) return;
    supabase.storage
      .from("ad-banners")
      .createSignedUrl(ad.banner_path, 60 * 60)
      .then(({ data }) => {
        if (data?.signedUrl) setSigned(data.signedUrl);
      });
  }, [ad.banner_path]);
  if (ad.video_url) {
    return (
      <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg bg-black/80 text-white">
        <Play className="h-5 w-5" />
      </div>
    );
  }
  const src = signed ?? ad.imagem_url;
  if (!src) return <div className="h-16 w-24 shrink-0 rounded-lg bg-muted" />;
  return <img src={src} alt={ad.titulo} className="h-16 w-24 shrink-0 rounded-lg object-cover" />;
}

function AnunciosPage() {
  const qc = useQueryClient();
  const { data: ads = [], isLoading } = useQuery({ queryKey: ["admin_ads"], queryFn: fetchAds });
  const { data: estabs = [] } = useQuery({ queryKey: ["admin_estabs_all"], queryFn: fetchEstabs });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Ad | null>(null);
  const [f, setF] = useState({ ...empty });

  const pending = ads.filter((a) => a.status === "pending");
  const others = ads.filter((a) => a.status !== "pending");

  useEffect(() => {
    if (editing) {
      setF({
        establishment_id: editing.establishment_id ?? "",
        titulo: editing.titulo,
        subtitulo: editing.subtitulo ?? "",
        imagem_url: editing.imagem_url ?? "",
        video_url: editing.video_url ?? "",
        destino_url: editing.destino_url ?? "",
        cta_texto: editing.cta_texto,
        ativo: editing.ativo,
        patrocinado: editing.patrocinado,
        prioridade: editing.prioridade,
        duracao_segundos: editing.duracao_segundos,
        inicio_em: editing.inicio_em ?? "",
        fim_em: editing.fim_em ?? "",
      });
    } else {
      setF({ ...empty });
    }
  }, [editing]);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["admin_ads"] });
    qc.invalidateQueries({ queryKey: ["ad_rotator"] });
    qc.invalidateQueries({ queryKey: ["sponsored_ads"] });
  }

  async function save() {
    if (!f.titulo.trim()) return toast.error("Título é obrigatório");
    if (!f.imagem_url.trim() && !f.video_url.trim())
      return toast.error("Informe uma imagem ou um link de vídeo");
    const payload = {
      establishment_id: f.establishment_id || null,
      titulo: f.titulo.trim(),
      subtitulo: f.subtitulo.trim() || null,
      imagem_url: f.imagem_url.trim() || null,
      video_url: f.video_url.trim() || null,
      destino_url: f.destino_url.trim() || null,
      cta_texto: f.cta_texto.trim() || "Ver mais",
      ativo: f.ativo,
      patrocinado: f.patrocinado,
      prioridade: Number(f.prioridade) || 0,
      duracao_segundos: Math.max(3, Number(f.duracao_segundos) || 6),
      inicio_em: f.inicio_em || null,
      fim_em: f.fim_em || null,
      status: editing?.status ?? "approved",
    };
    const { error } = editing
      ? await supabase.from("sponsored_ads").update(payload).eq("id", editing.id)
      : await supabase.from("sponsored_ads").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Anúncio atualizado" : "Anúncio criado");
    setOpen(false);
    setEditing(null);
    invalidate();
  }

  async function toggle(ad: Ad) {
    const { error } = await supabase
      .from("sponsored_ads")
      .update({ ativo: !ad.ativo })
      .eq("id", ad.id);
    if (error) return toast.error(error.message);
    invalidate();
  }

  async function remove(id: string) {
    if (!confirm("Remover este anúncio?")) return;
    const ad = ads.find((a) => a.id === id);
    if (ad?.banner_path) await supabase.storage.from("ad-banners").remove([ad.banner_path]);
    const { error } = await supabase.from("sponsored_ads").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Anúncio removido");
    invalidate();
  }

  async function approve(ad: Ad) {
    const { error } = await supabase
      .from("sponsored_ads")
      .update({ status: "approved", ativo: true, motivo_recusa: null })
      .eq("id", ad.id);
    if (error) return toast.error(error.message);
    toast.success("Campanha aprovada");
    invalidate();
  }

  async function reject(ad: Ad) {
    const motivo = prompt("Motivo da recusa (será enviado ao estabelecimento):");
    if (!motivo || !motivo.trim()) return;
    const { error } = await supabase
      .from("sponsored_ads")
      .update({ status: "rejected", ativo: false, motivo_recusa: motivo.trim() })
      .eq("id", ad.id);
    if (error) return toast.error(error.message);
    toast.success("Campanha recusada");
    invalidate();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Megaphone className="h-6 w-6 text-primary" /> Anúncios patrocinados
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie anúncios da plataforma e aprove campanhas enviadas pelos estabelecimentos.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(null)}>
              <Plus className="mr-1 h-4 w-4" /> Novo anúncio
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar anúncio" : "Novo anúncio"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label>Título</Label>
                <Input
                  value={f.titulo}
                  onChange={(e) => setF({ ...f, titulo: e.target.value })}
                  placeholder="Ex.: Nova hamburgueria na sua área"
                />
              </div>
              <div>
                <Label>Subtítulo</Label>
                <Input
                  value={f.subtitulo}
                  onChange={(e) => setF({ ...f, subtitulo: e.target.value })}
                  placeholder="Ex.: 20% off na primeira compra"
                />
              </div>
              <div>
                <Label>URL da imagem (1200×630 recomendado)</Label>
                <Textarea
                  rows={2}
                  value={f.imagem_url}
                  onChange={(e) => setF({ ...f, imagem_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label>URL do vídeo (YouTube)</Label>
                <Input
                  value={f.video_url}
                  onChange={(e) => setF({ ...f, video_url: e.target.value })}
                  placeholder="https://youtu.be/..."
                />
              </div>
              <div>
                <Label>Link de destino ao clicar</Label>
                <Input
                  value={f.destino_url}
                  onChange={(e) => setF({ ...f, destino_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Botão (CTA)</Label>
                  <Input
                    value={f.cta_texto}
                    onChange={(e) => setF({ ...f, cta_texto: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Duração (segundos)</Label>
                  <Input
                    type="number"
                    min={3}
                    value={f.duracao_segundos}
                    onChange={(e) => setF({ ...f, duracao_segundos: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div>
                <Label>Estabelecimento (abre ao clicar, se sem link)</Label>
                <Select
                  value={f.establishment_id || "none"}
                  onValueChange={(v) => setF({ ...f, establishment_id: v === "none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {estabs.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Início</Label>
                  <Input
                    type="datetime-local"
                    value={f.inicio_em}
                    onChange={(e) => setF({ ...f, inicio_em: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Fim</Label>
                  <Input
                    type="datetime-local"
                    value={f.fim_em}
                    onChange={(e) => setF({ ...f, fim_em: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Prioridade</Label>
                  <Input
                    type="number"
                    value={f.prioridade}
                    onChange={(e) => setF({ ...f, prioridade: Number(e.target.value) })}
                  />
                </div>
                <div className="flex items-end gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={f.ativo} onCheckedChange={(v) => setF({ ...f, ativo: v })} />{" "}
                    Ativo
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={f.patrocinado}
                      onCheckedChange={(v) => setF({ ...f, patrocinado: v })}
                    />{" "}
                    Marcar "Patrocinado"
                  </label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={save}>{editing ? "Salvar" : "Criar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {pending.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
          <h2 className="text-sm font-bold text-amber-800 dark:text-amber-400">
            Aguardando aprovação ({pending.length})
          </h2>
          <div className="grid gap-2">
            {pending.map((ad) => (
              <div
                key={ad.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <AdThumb ad={ad} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{ad.titulo}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {ad.establishments?.nome ?? "—"} · {ad.video_url ? "Vídeo" : "Banner"}
                  </p>
                  {ad.destino_url && (
                    <a
                      href={ad.destino_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> {ad.destino_url.slice(0, 60)}
                    </a>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => reject(ad)} className="gap-1">
                  <X className="h-4 w-4 text-rose-600" /> Recusar
                </Button>
                <Button size="sm" onClick={() => approve(ad)} className="gap-1">
                  <Check className="h-4 w-4" /> Aprovar
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : others.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nenhum anúncio cadastrado ainda.
        </div>
      ) : (
        <div className="grid gap-3">
          {others.map((ad) => (
            <div
              key={ad.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
            >
              <AdThumb ad={ad} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold">{ad.titulo}</p>
                  {ad.patrocinado && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      Patrocinado
                    </span>
                  )}
                  {!ad.ativo && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      Pausado
                    </span>
                  )}
                  {ad.status === "rejected" && (
                    <Badge className={cn("bg-rose-500 text-white")}>Recusada</Badge>
                  )}
                </div>
                {ad.subtitulo && (
                  <p className="truncate text-xs text-muted-foreground">{ad.subtitulo}</p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {ad.establishments?.nome && <>{ad.establishments.nome} · </>}
                  Prioridade {ad.prioridade} · {ad.duracao_segundos}s
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Switch checked={ad.ativo} onCheckedChange={() => toggle(ad)} />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditing(ad);
                    setOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove(ad.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
