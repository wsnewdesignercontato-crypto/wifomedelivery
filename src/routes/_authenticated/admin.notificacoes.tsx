import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/notificacoes")({ component: NotificacoesPage });

type Notif = { id: string; titulo: string; mensagem: string; audience: string | null; user_id: string | null; created_at: string; lida: boolean };

async function fetchNotifs() {
  const { data, error } = await supabase.from("notifications").select("*").order("created_at",{ascending:false}).limit(200);
  if (error) throw error;
  return (data ?? []) as Notif[];
}

async function fetchUsersByRole(role: "cliente"|"estabelecimento"|"entregador"|"all") {
  if (role === "all") {
    const { data } = await supabase.from("profiles").select("id");
    return (data ?? []).map((p) => p.id);
  }
  const { data } = await supabase.from("user_roles").select("user_id").eq("role", role);
  return (data ?? []).map((r) => r.user_id);
}

function NotificacoesPage() {
  const { data = [], isLoading } = useQuery({ queryKey:["notifs"], queryFn: fetchNotifs });
  const qc = useQueryClient();
  const [f, setF] = useState({ titulo:"", mensagem:"", audience:"all" as const, link_url:"" });
  const [sending, setSending] = useState(false);

  async function broadcast() {
    if (!f.titulo || !f.mensagem) return toast.error("Título e mensagem obrigatórios");
    setSending(true);
    try {
      const userIds = await fetchUsersByRole(f.audience);
      if (userIds.length === 0) { toast.error("Nenhum destinatário"); return; }
      const rows = userIds.map((uid) => ({ user_id: uid, audience: f.audience, titulo: f.titulo, mensagem: f.mensagem, link_url: f.link_url || null }));
      const { error } = await supabase.from("notifications").insert(rows);
      if (error) throw error;
      toast.success(`Enviada para ${userIds.length} usuários`);
      setF({ titulo:"", mensagem:"", audience:"all", link_url:"" });
      qc.invalidateQueries({ queryKey:["notifs"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar");
    } finally { setSending(false); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Notificações</h1>
        <p className="text-sm text-muted-foreground">Envie comunicados in-app para usuários da plataforma.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 font-semibold">Nova notificação em massa</h3>
          <div className="space-y-3">
            <div><Label>Audiência</Label>
              <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={f.audience} onChange={(e)=>setF({...f,audience:e.target.value as "all"})}>
                <option value="all">Todos usuários</option>
                <option value="cliente">Clientes</option>
                <option value="estabelecimento">Estabelecimentos</option>
                <option value="entregador">Entregadores</option>
              </select>
            </div>
            <div><Label>Título</Label><Input value={f.titulo} onChange={(e)=>setF({...f,titulo:e.target.value})}/></div>
            <div><Label>Mensagem</Label><Textarea value={f.mensagem} onChange={(e)=>setF({...f,mensagem:e.target.value})} rows={4}/></div>
            <div><Label>Link (opcional)</Label><Input value={f.link_url} onChange={(e)=>setF({...f,link_url:e.target.value})} placeholder="/cliente"/></div>
            <Button onClick={broadcast} disabled={sending} className="w-full"><Send className="mr-2 h-4 w-4"/>{sending?"Enviando…":"Enviar"}</Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-4 text-sm font-semibold">Histórico</div>
          <div className="max-h-[600px] overflow-y-auto">
            {isLoading && <p className="p-6 text-center text-muted-foreground">Carregando…</p>}
            {!isLoading && data.length===0 && <p className="p-6 text-center text-muted-foreground">Nenhuma notificação enviada.</p>}
            {data.map((n) => (
              <div key={n.id} className="border-b border-border/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{n.titulo}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{n.mensagem}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString("pt-BR")}</span>
                </div>
                {n.audience && <span className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">{n.audience}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
