import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Play, Pause, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/campanhas")({ component: CampanhasPage });

type Campaign = { id: string; nome: string; descricao: string | null; status: string; audience: string; starts_at: string | null; ends_at: string | null };

async function fetchCampaigns() {
  const { data, error } = await supabase.from("campaigns").select("*").order("created_at",{ascending:false});
  if (error) throw error;
  return (data ?? []) as Campaign[];
}

function CampanhasPage() {
  const { data = [], isLoading } = useQuery({ queryKey:["campaigns"], queryFn: fetchCampaigns });
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ nome:"", descricao:"", audience:"all" });

  async function create() {
    if (!f.nome) return toast.error("Nome obrigatório");
    const { error } = await supabase.from("campaigns").insert({ ...f, status:"draft" });
    if (error) return toast.error(error.message);
    toast.success("Campanha criada");
    setOpen(false); setF({ nome:"", descricao:"", audience:"all" });
    qc.invalidateQueries({ queryKey:["campaigns"] });
  }
  async function setStatus(id: string, status: 'active' | 'draft' | 'ended' | 'paused' | 'scheduled') {
    await supabase.from("campaigns").update({ status }).eq("id", id);
    qc.invalidateQueries({ queryKey:["campaigns"] });
  }
  async function remove(id: string) {
    if (!confirm("Excluir campanha?")) return;
    await supabase.from("campaigns").delete().eq("id", id);
    qc.invalidateQueries({ queryKey:["campaigns"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campanhas</h1>
          <p className="text-sm text-muted-foreground">Ações de marketing segmentadas.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4"/>Nova campanha</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova campanha</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={f.nome} onChange={(e)=>setF({...f,nome:e.target.value})}/></div>
              <div><Label>Descrição</Label><Textarea value={f.descricao} onChange={(e)=>setF({...f,descricao:e.target.value})}/></div>
              <div><Label>Audiência</Label>
                <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={f.audience} onChange={(e)=>setF({...f,audience:e.target.value})}>
                  <option value="all">Todos usuários</option>
                  <option value="cliente">Clientes</option>
                  <option value="estabelecimento">Estabelecimentos</option>
                  <option value="entregador">Entregadores</option>
                  <option value="inactive">Inativos 30 dias</option>
                </select>
              </div>
              <Button onClick={create} className="w-full">Criar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading && <p className="text-muted-foreground">Carregando…</p>}
        {!isLoading && data.length===0 && <p className="text-muted-foreground">Sem campanhas.</p>}
        {data.map((c) => (
          <div key={c.id} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold">{c.nome}</h3>
                <p className="text-xs text-muted-foreground">{c.audience} · {c.status}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs ${c.status==="active"?"bg-emerald-500/10 text-emerald-600":"bg-muted text-muted-foreground"}`}>{c.status}</span>
            </div>
            {c.descricao && <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{c.descricao}</p>}
            <div className="mt-4 flex gap-2">
              {c.status !== "active"
                ? <Button size="sm" onClick={()=>setStatus(c.id,"active")}><Play className="mr-1 h-3 w-3"/>Ativar</Button>
                : <Button size="sm" variant="secondary" onClick={()=>setStatus(c.id,"paused")}><Pause className="mr-1 h-3 w-3"/>Pausar</Button>}
              <Button size="sm" variant="ghost" onClick={()=>remove(c.id)}><Trash2 className="h-4 w-4"/></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
