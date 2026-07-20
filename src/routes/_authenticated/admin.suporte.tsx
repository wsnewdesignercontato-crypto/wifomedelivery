import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/suporte")({ component: SuportePage });

type Ticket = { id: string; assunto: string; status: string; priority: string; user_id: string; created_at: string };
type Msg = { id: string; ticket_id: string; sender_id: string; mensagem: string; created_at: string };

async function fetchTickets() {
  const { data, error } = await supabase.from("support_tickets").select("*").order("created_at",{ascending:false}).limit(200);
  if (error) throw error;
  return (data ?? []) as Ticket[];
}

async function fetchMsgs(ticketId: string) {
  const { data, error } = await supabase.from("support_messages").select("*").eq("ticket_id", ticketId).order("created_at");
  if (error) throw error;
  return (data ?? []) as Msg[];
}

function SuportePage() {
  const { data: tickets = [], isLoading } = useQuery({ queryKey:["tickets"], queryFn: fetchTickets });
  const qc = useQueryClient();
  const [sel, setSel] = useState<Ticket | null>(null);
  const { data: msgs = [] } = useQuery({ queryKey:["ticket-msgs", sel?.id], queryFn: () => fetchMsgs(sel!.id), enabled: !!sel });
  const [text, setText] = useState("");

  useEffect(() => {
    if (!sel) return;
    const ch = supabase.channel(`ticket-${sel.id}`)
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"support_messages", filter:`ticket_id=eq.${sel.id}` },
        () => qc.invalidateQueries({ queryKey:["ticket-msgs", sel.id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sel, qc]);

  async function send() {
    if (!text.trim() || !sel) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("support_messages").insert({ ticket_id: sel.id, sender_id: u.user.id, mensagem: text.trim() });
    if (error) return toast.error(error.message);
    setText("");
  }

  async function setStatus(status: string) {
    if (!sel) return;
    await supabase.from("support_tickets").update({ status }).eq("id", sel.id);
    qc.invalidateQueries({ queryKey:["tickets"] });
    setSel({ ...sel, status });
  }

  return (
    <div className="space-y-4">
      <div><h1 className="text-3xl font-bold tracking-tight">Suporte</h1><p className="text-sm text-muted-foreground">Tickets abertos por usuários e chat em tempo real.</p></div>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-3 text-sm font-semibold">Tickets ({tickets.length})</div>
          <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
            {isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando…</p>}
            {!isLoading && tickets.length===0 && <p className="p-4 text-sm text-muted-foreground">Nenhum ticket.</p>}
            {tickets.map((t) => (
              <button key={t.id} onClick={()=>setSel(t)}
                className={`block w-full border-b border-border/50 p-3 text-left transition-colors ${sel?.id===t.id?"bg-primary/5":"hover:bg-muted/30"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium text-sm">{t.assunto}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${t.status==="open"?"bg-amber-500/10 text-amber-600":"bg-muted text-muted-foreground"}`}>{t.status}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{new Date(t.created_at).toLocaleString("pt-BR")}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-border bg-card">
          {!sel ? (
            <div className="flex flex-1 items-center justify-center p-10 text-muted-foreground">Selecione um ticket</div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-border p-4">
                <div><h3 className="font-semibold">{sel.assunto}</h3><p className="text-xs text-muted-foreground">Prioridade: {sel.priority}</p></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={()=>setStatus("pending")}>Pendente</Button>
                  <Button size="sm" onClick={()=>setStatus("resolved")}>Resolver</Button>
                </div>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {msgs.length===0 && <p className="text-center text-sm text-muted-foreground">Sem mensagens ainda.</p>}
                {msgs.map((m) => (
                  <div key={m.id} className="rounded-lg bg-muted/40 p-3 text-sm">
                    <p>{m.mensagem}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleString("pt-BR")}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 border-t border-border p-3">
                <Input value={text} onChange={(e)=>setText(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&send()} placeholder="Responder…"/>
                <Button onClick={send}>Enviar</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
