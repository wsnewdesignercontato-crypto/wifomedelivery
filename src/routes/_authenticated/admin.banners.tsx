import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Upload, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/banners")({ component: BannersPage });

type Banner = { id: string; titulo: string; image_url: string; link_url: string | null; posicao: number; ativo: boolean };

async function fetchBanners() {
  const { data, error } = await supabase.from("banners").select("*").order("posicao");
  if (error) throw error;
  return (data ?? []) as Banner[];
}

function BannersPage() {
  const { data = [], isLoading } = useQuery({ queryKey:["banners"], queryFn: fetchBanners });
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ titulo:"", image_url:"", link_url:"", posicao:0 });

  async function create() {
    if (!f.titulo || !f.image_url) return toast.error("Título e imagem obrigatórios");
    const { error } = await supabase.from("banners").insert(f);
    if (error) return toast.error(error.message);
    toast.success("Banner criado");
    setOpen(false); setF({ titulo:"", image_url:"", link_url:"", posicao:0 });
    qc.invalidateQueries({ queryKey:["banners"] });
  }
  async function toggle(b: Banner) {
    await supabase.from("banners").update({ ativo: !b.ativo }).eq("id", b.id);
    qc.invalidateQueries({ queryKey:["banners"] });
  }
  async function remove(id: string) {
    if (!confirm("Excluir banner?")) return;
    await supabase.from("banners").delete().eq("id", id);
    qc.invalidateQueries({ queryKey:["banners"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Banners</h1>
          <p className="text-sm text-muted-foreground">Banners rotativos exibidos no app do cliente.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4"/>Novo banner</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo banner</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Título</Label><Input value={f.titulo} onChange={(e)=>setF({...f,titulo:e.target.value})}/></div>
              <div><Label>URL da imagem</Label><Input value={f.image_url} onChange={(e)=>setF({...f,image_url:e.target.value})} placeholder="https://…"/></div>
              <div><Label>Link (opcional)</Label><Input value={f.link_url} onChange={(e)=>setF({...f,link_url:e.target.value})}/></div>
              <div><Label>Posição</Label><Input type="number" value={f.posicao} onChange={(e)=>setF({...f,posicao:Number(e.target.value)})}/></div>
              <Button onClick={create} className="w-full">Criar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {isLoading && <p className="text-muted-foreground">Carregando…</p>}
        {!isLoading && data.length===0 && <p className="text-muted-foreground">Nenhum banner.</p>}
        {data.map((b) => (
          <div key={b.id} className="overflow-hidden rounded-xl border border-border bg-card">
            <img src={b.image_url} alt={b.titulo} className="h-40 w-full object-cover" onError={(e)=>{(e.currentTarget as HTMLImageElement).style.opacity="0.3"}}/>
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{b.titulo}</h3>
                  <p className="text-xs text-muted-foreground">Posição {b.posicao}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={()=>toggle(b)} className={`rounded-full px-2 py-0.5 text-xs ${b.ativo?"bg-emerald-500/10 text-emerald-600":"bg-muted text-muted-foreground"}`}>{b.ativo?"Ativo":"Inativo"}</button>
                  <Button size="icon" variant="ghost" onClick={()=>remove(b.id)}><Trash2 className="h-4 w-4"/></Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
