import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Megaphone, Sparkles, Check, Clock, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab } from "@/hooks/use-my-estab";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { brl } from "@/lib/format";

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
  impressoes_estimadas: number | null;
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
  ad_plans: { nome: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando aprovação",
  active: "Ativo",
  expired: "Expirado",
  cancelled: "Cancelado",
  rejected: "Recusado",
};

function AnunciosEstabPage() {
  const { estab } = useMyEstab();
  const qc = useQueryClient();

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["ad_plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ad_plans").select("*").eq("ativo", true).order("preco_cents");
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
        .select("*, ad_plans(nome)")
        .eq("establishment_id", estab!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Sub[];
    },
  });

  const [pick, setPick] = useState<Plan | null>(null);
  const [metodo, setMetodo] = useState("pix");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  const ativo = subs.find((s) => s.status === "active");

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
    const { error } = await supabase.from("estab_ad_subscriptions").update({ status: "cancelled" }).eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Cancelado");
    qc.invalidateQueries({ queryKey: ["estab_ad_subs", estab?.id] });
  }

  if (!estab) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
          <Megaphone className="h-6 w-6 text-primary" /> Anúncios
        </h1>
        <p className="text-sm text-muted-foreground">Contrate um plano e ganhe destaque no app dos clientes.</p>
      </div>

      {ativo && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                <Sparkles className="h-4 w-4" /> Plano ativo: {ativo.ad_plans?.nome}
              </p>
              <p className="text-xs text-muted-foreground">
                Válido até {ativo.fim_em ? new Date(ativo.fim_em).toLocaleDateString("pt-BR") : "—"} · Pago {brl(ativo.preco_pago_cents)}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => cancelar(ativo)}>Cancelar</Button>
          </div>
        </div>
      )}

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Planos disponíveis</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isLoading && Array.from({ length: 3 }).map((_, i) => (<div key={i} className="h-64 animate-pulse rounded-2xl bg-muted" />))}
          {plans.map((p) => (
            <div key={p.id} className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: p.cor ?? "#FF6B00" }} />
              <h3 className="text-lg font-black">{p.nome}</h3>
              <p className="mt-1 line-clamp-2 min-h-10 text-xs text-muted-foreground">{p.descricao ?? "—"}</p>
              <div className="mt-3">
                <p className="text-3xl font-black text-primary">{brl(p.preco_cents)}</p>
                <p className="text-[11px] text-muted-foreground">por {p.duracao_dias} dias · até {p.max_anuncios} anúncio(s)</p>
              </div>
              <ul className="mt-3 space-y-1 text-xs">
                {p.destaque_home && (<li className="flex items-center gap-1.5 text-emerald-600"><Check className="h-3.5 w-3.5" /> Destaque na Home</li>)}
                {p.destaque_categoria && (<li className="flex items-center gap-1.5 text-emerald-600"><Check className="h-3.5 w-3.5" /> Destaque na Categoria</li>)}
                {p.destaque_busca && (<li className="flex items-center gap-1.5 text-emerald-600"><Check className="h-3.5 w-3.5" /> Destaque na Busca</li>)}
                {p.impressoes_estimadas && (<li className="flex items-center gap-1.5 text-muted-foreground"><Sparkles className="h-3.5 w-3.5" /> ~{p.impressoes_estimadas.toLocaleString("pt-BR")} impressões</li>)}
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
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Minhas assinaturas</h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {subs.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Você ainda não contratou nenhum plano.</div>}
          {subs.map((s, i) => (
            <div key={s.id} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{s.ad_plans?.nome ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  <Clock className="mr-1 inline h-3 w-3" />
                  {s.status === "active" && s.fim_em ? `até ${new Date(s.fim_em).toLocaleDateString("pt-BR")}` : new Date(s.created_at).toLocaleDateString("pt-BR")}
                  {" · "}{brl(s.preco_pago_cents)}
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
                    s.status === "active" ? "bg-emerald-500 text-white" :
                    s.status === "pending" ? "bg-amber-500 text-white" :
                    s.status === "rejected" ? "bg-rose-500 text-white" : ""
                  }
                >
                  {STATUS_LABEL[s.status] ?? s.status}
                </Badge>
                {s.status === "pending" && (
                  <Button size="sm" variant="ghost" onClick={() => cancelar(s)}><XCircle className="h-4 w-4" /></Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <Dialog open={!!pick} onOpenChange={(v) => !v && setPick(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Contratar {pick?.nome}</DialogTitle></DialogHeader>
          {pick && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-sm font-semibold">{brl(pick.preco_cents)} <span className="text-xs font-normal text-muted-foreground">/ {pick.duracao_dias} dias</span></p>
                <p className="text-xs text-muted-foreground">{pick.descricao}</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Forma de pagamento</label>
                <Select value={metodo} onValueChange={setMetodo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">Pix</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="saldo">Descontar do saldo da carteira</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Observação (opcional)</label>
                <Textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: preferência de horário, produto em destaque…" />
              </div>
              <p className="text-xs text-muted-foreground">Após confirmar, o admin analisa e ativa o plano.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPick(null)}>Cancelar</Button>
            <Button onClick={contratar} disabled={saving}>Confirmar contratação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
