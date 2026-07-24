import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab } from "@/hooks/use-my-estab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Upload, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/estabelecimento/banners")({
  component: BannersPage,
});

type Banner = { id: string; titulo: string; subtitulo: string | null; imagem_url: string | null; ativo: boolean; ordem: number };

function BannersPage() {
  const { estab } = useMyEstab();
  const [items, setItems] = useState<Banner[]>([]);
  const [open, setOpen] = useState(false);

  async function reload() {
    if (!estab) return;
    const { data } = await supabase.from("estab_banners")
      .select("id,titulo,subtitulo,imagem_url,ativo,ordem").eq("establishment_id", estab.id).order("ordem");
    setItems((data ?? []) as Banner[]);
  }
  useEffect(() => { reload(); }, [estab?.id]);

  async function toggle(b: Banner) { await supabase.from("estab_banners").update({ ativo: !b.ativo }).eq("id", b.id); reload(); }
  async function remover(id: string) {
    if (!confirm("Excluir banner?")) return;
    await supabase.from("estab_banners").delete().eq("id", id); reload();
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight">Banners promocionais</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Novo banner</Button></DialogTrigger>
          <DialogContent><BannerForm onSaved={() => { setOpen(false); reload(); }} /></DialogContent>
        </Dialog>
      </div>
      <div className="grid gap-3">
        {items.map((b) => (
          <div key={b.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
            <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
              {b.imagem_url && <img src={b.imagem_url} alt={b.titulo} className="h-full w-full object-cover" />}
            </div>
            <div className="flex-1">
              <p className="font-semibold">{b.titulo}</p>
              <p className="text-xs text-muted-foreground">{b.subtitulo}</p>
            </div>
            <Switch checked={b.ativo} onCheckedChange={() => toggle(b)} />
            <Button size="icon" variant="ghost" onClick={() => remover(b.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">Sem banners cadastrados.</p>}
      </div>
    </div>
  );
}

function BannerForm({ onSaved }: { onSaved: () => void }) {
  const { estab } = useMyEstab();
  const [f, setF] = useState({ titulo: "", subtitulo: "", imagem_url: "", cta_texto: "", cta_link: "" });
  async function salvar() {
    if (!estab || !f.titulo.trim()) return toast.error("Título obrigatório");
    const { error } = await supabase.from("estab_banners").insert({
      establishment_id: estab.id, titulo: f.titulo.trim(),
      subtitulo: f.subtitulo || null, imagem_url: f.imagem_url || null,
      cta_texto: f.cta_texto || null, cta_link: f.cta_link || null,
    });
    if (error) toast.error("Falha"); else { toast.success("Banner criado"); onSaved(); }
  }
  return (
    <>
      <DialogHeader><DialogTitle>Novo banner</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div><Label>Título</Label><Input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></div>
        <div><Label>Subtítulo</Label><Input value={f.subtitulo} onChange={(e) => setF({ ...f, subtitulo: e.target.value })} /></div>
        <div><Label>URL da imagem</Label><Input value={f.imagem_url} onChange={(e) => setF({ ...f, imagem_url: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>CTA texto</Label><Input value={f.cta_texto} onChange={(e) => setF({ ...f, cta_texto: e.target.value })} /></div>
          <div><Label>CTA link</Label><Input value={f.cta_link} onChange={(e) => setF({ ...f, cta_link: e.target.value })} /></div>
        </div>
      </div>
      <DialogFooter><Button onClick={salvar}>Criar</Button></DialogFooter>
    </>
  );
}
