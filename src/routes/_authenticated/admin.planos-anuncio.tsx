import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Sparkles, Plus, Pencil, Trash2, Check, X, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/planos-anuncio")({
  component: PlanosPage,
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
  impressoes_estimadas: number | null;
  cor: string | null;
  ativo: boolean;
};

type Sub = {
  id: string;
  establishment_id: string;
  plan_id: string;
  status: string;
  preco_pago_cents: number;
  inicio_em: string | null;
  fim_em: string | null;
  observacao: string | null;
  created_at: string;
  establishments: { nome: string } | null;
  ad_plans: { nome: string } | null;
};

const empty: Omit<Plan, "id"> = {
  nome: "",
  descricao: "",
  preco_cents: 0,
  duracao_dias: 7,
  prioridade: 0,
  max_anuncios: 1,
  destaque_home: false,
  destaque_categoria: true,
  destaque_busca: false,
  impressoes_estimadas: 5000,
  cor: "#FF6B00",
  ativo: true,
};

async function fetchPlans(): Promise<Plan[]> {
  const { data, error } = await supabase.from("ad_plans").select("*").order("preco_cents");
  if (error) throw error;
  return (data ?? []) as Plan[];
}

async function fetchSubs(): Promise<Sub[]> {
  const { data, error } = await supabase
    .from("estab_ad_subscriptions")
    .select("*, establishments(nome), ad_plans(nome)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as Sub[];
}

function PlanosPage() {
  const qc = useQueryClient();
  const { data: plans = [], isLoading } = useQuery({ queryKey: ["ad_plans_admin"], queryFn: fetchPlans });
  const { data: subs = [] } = useQuery({ queryKey: ["ad_subs_admin"], queryFn: fetchSubs });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [f, setF] = useState({ ...empty });

  function openNew() {
    setEditing(null);
    setF({ ...empty });
    setOpen(true);
  }
  function openEdit(p: Plan) {
    setEditing(p);
    setF({ ...p, descricao: p.descricao ?? "" });
    setOpen(true);
  }

  async function salvar() {
    if (!f.nome.trim()) return toast.error("Nome obrigatório");
    const payload = { ...f, descricao: f.descricao || null };
    const q = editing
      ? supabase.from("ad_plans").update(payload).eq("id", editing.id)
      : supabase.from("ad_plans").insert(payload);
    const { error } = await q;
    if (error) return toast.error(error.message);
    toast.success(editing ? "Plano atualizado" : "Plano criado");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["ad_plans_admin"] });
  }

  async function remover(id: string) {
    if (!confirm("Excluir este plano?")) return;
    const { error } = await supabase.from("ad_plans").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    qc.invalidateQueries({ queryKey: ["ad_plans_admin"] });
  }

  async function decidir(s: Sub, novo: "active" | "rejected") {
    const patch: {
      status: string;
      aprovado_em: string;
      inicio_em?: string;
      fim_em?: string;
    } = { status: novo, aprovado_em: new Date().toISOString() };
    if (novo === "active") {
      const plan = plans.find((p) => p.id === s.plan_id);
      const dias = plan?.duracao_dias ?? 7;
      const inicio = new Date();
      const fim = new Date(inicio.getTime() + dias * 24 * 60 * 60 * 1000);
      patch.inicio_em = inicio.toISOString();
      patch.fim_em = fim.toISOString();
    }
    const { error } = await supabase.from("estab_ad_subscriptions").update(patch).eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success(novo === "active" ? "Ativado" : "Recusado");
    qc.invalidateQueries({ queryKey: ["ad_subs_admin"] });
  }

  const pendentes = subs.filter((s) => s.status === "pending");
  const outros = subs.filter((s) => s.status !== "pending");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Sparkles className="h-6 w-6 text-primary" /> Planos de anúncio
          </h1>
          <p className="text-sm text-muted-foreground">Defina pacotes que os estabelecimentos podem contratar.</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-1.5 h-4 w-4" /> Novo plano</Button>
      </div>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Planos disponíveis</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isLoading && Array.from({ length: 3 }).map((_, i) => (<div key={i} className="h-56 animate-pulse rounded-2xl bg-muted" />))}
          {plans.map((p) => (
            <div key={p.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.cor ?? "#FF6B00" }} />
                    <h3 className="truncate text-lg font-black">{p.nome}</h3>
                    {!p.ativo && <Badge variant="secondary">Inativo</Badge>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.descricao ?? "—"}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-primary">{brl(p.preco_cents)}</p>
                  <p className="text-[11px] text-muted-foreground">/ {p.duracao_dias} dias</p>
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                <li>• Prioridade: <b>{p.prioridade}</b></li>
                <li>• Máx. anúncios: <b>{p.max_anuncios}</b></li>
                <li>• Impressões estimadas: <b>{(p.impressoes_estimadas ?? 0).toLocaleString("pt-BR")}</b></li>
                <li className="flex flex-wrap gap-1 pt-1">
                  {p.destaque_home && <Badge variant="outline" className="text-[10px]">Home</Badge>}
                  {p.destaque_categoria && <Badge variant="outline" className="text-[10px]">Categoria</Badge>}
                  {p.destaque_busca && <Badge variant="outline" className="text-[10px]">Busca</Badge>}
                </li>
              </ul>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(p)}><Pencil className="mr-1 h-3.5 w-3.5" /> Editar</Button>
                <Button size="sm" variant="outline" className="text-rose-600" onClick={() => remover(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ))}
          {!isLoading && plans.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Nenhum plano ainda.</div>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Assinaturas pendentes</h2>
        <div className="space-y-2">
          {pendentes.length === 0 && <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma assinatura pendente.</p>}
          {pendentes.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{s.establishments?.nome ?? "—"} <span className="text-muted-foreground">·</span> {s.ad_plans?.nome ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{brl(s.preco_pago_cents)} · solicitado em {new Date(s.created_at).toLocaleString("pt-BR")}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="text-rose-600" onClick={() => decidir(s, "rejected")}><X className="mr-1 h-3.5 w-3.5" /> Recusar</Button>
                <Button size="sm" onClick={() => decidir(s, "active")}><Check className="mr-1 h-3.5 w-3.5" /> Ativar</Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Histórico de assinaturas</h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {outros.slice(0, 30).map((s, i) => (
            <div key={s.id} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{s.establishments?.nome ?? "—"} · {s.ad_plans?.nome ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  <Clock className="mr-1 inline h-3 w-3" />
                  {s.fim_em ? `até ${new Date(s.fim_em).toLocaleDateString("pt-BR")}` : "—"} · {brl(s.preco_pago_cents)}
                </p>
              </div>
              <Badge variant={s.status === "active" ? "default" : "secondary"} className={s.status === "active" ? "bg-emerald-500 text-white" : ""}>
                {s.status}
              </Badge>
            </div>
          ))}
          {outros.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Sem histórico.</div>}
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Editar plano" : "Novo plano"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Nome</Label><Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
            <div><Label>Descrição</Label><Textarea value={f.descricao ?? ""} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Preço (centavos)</Label><Input type="number" value={f.preco_cents} onChange={(e) => setF({ ...f, preco_cents: Number(e.target.value) })} /></div>
              <div><Label>Duração (dias)</Label><Input type="number" value={f.duracao_dias} onChange={(e) => setF({ ...f, duracao_dias: Number(e.target.value) })} /></div>
              <div><Label>Prioridade</Label><Input type="number" value={f.prioridade} onChange={(e) => setF({ ...f, prioridade: Number(e.target.value) })} /></div>
              <div><Label>Máx. anúncios</Label><Input type="number" value={f.max_anuncios} onChange={(e) => setF({ ...f, max_anuncios: Number(e.target.value) })} /></div>
              <div><Label>Impressões estimadas</Label><Input type="number" value={f.impressoes_estimadas ?? 0} onChange={(e) => setF({ ...f, impressoes_estimadas: Number(e.target.value) })} /></div>
              <div><Label>Cor</Label><Input type="color" value={f.cor ?? "#FF6B00"} onChange={(e) => setF({ ...f, cor: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-sm">Destaque na Home</span><Switch checked={f.destaque_home} onCheckedChange={(v) => setF({ ...f, destaque_home: v })} /></label>
              <label className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-sm">Destaque Categoria</span><Switch checked={f.destaque_categoria} onCheckedChange={(v) => setF({ ...f, destaque_categoria: v })} /></label>
              <label className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-sm">Destaque na Busca</span><Switch checked={f.destaque_busca} onCheckedChange={(v) => setF({ ...f, destaque_busca: v })} /></label>
              <label className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-sm">Ativo</span><Switch checked={f.ativo} onCheckedChange={(v) => setF({ ...f, ativo: v })} /></label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={salvar}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
