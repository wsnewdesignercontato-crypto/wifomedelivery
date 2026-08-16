import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LifeBuoy } from "lucide-react";
import { useMyCourier } from "@/hooks/use-courier";

export const Route = createFileRoute("/_authenticated/entregador/suporte")({
  component: Suporte,
});

type Ticket = {
  id: string;
  assunto: string;
  status: string;
  created_at: string;
  priority: string | null;
};

function Suporte() {
  const { courier } = useMyCourier();
  const courierId = courier?.user_id;
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [f, setF] = useState({ assunto: "", mensagem: "", priority: "normal" });

  const load = useCallback(async () => {
    if (!courierId) return;
    const { data } = await supabase
      .from("support_tickets")
      .select("id,assunto,status,created_at,priority")
      .eq("user_id", courierId)
      .order("created_at", { ascending: false });
    setTickets((data ?? []) as Ticket[]);
  }, [courierId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function abrir() {
    if (!courier || !f.assunto || !f.mensagem) return toast.error("Preencha assunto e mensagem");
    const { data, error } = await supabase
      .from("support_tickets")
      .insert({
        user_id: courier.user_id,
        assunto: f.assunto,
        status: "open",
        priority: f.priority as "normal",
      })
      .select("id")
      .single();
    if (error || !data) return toast.error(error?.message ?? "Erro");
    await supabase
      .from("support_messages")
      .insert({ ticket_id: data.id, sender_id: courier.user_id, mensagem: f.mensagem });
    toast.success("Chamado aberto");
    setF({ assunto: "", mensagem: "", priority: "normal" });
    void load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">Suporte</h1>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <h2 className="mb-3 font-semibold">Abrir chamado</h2>
        <div className="space-y-3">
          <div>
            <Label>Assunto</Label>
            <Input value={f.assunto} onChange={(e) => setF({ ...f, assunto: e.target.value })} />
          </div>
          <div>
            <Label>Mensagem</Label>
            <Textarea
              rows={4}
              value={f.mensagem}
              onChange={(e) => setF({ ...f, mensagem: e.target.value })}
            />
          </div>
          <Button onClick={abrir}>Enviar</Button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Meus chamados</h2>
        {tickets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <LifeBuoy className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Nenhum chamado aberto.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-card"
              >
                <div>
                  <p className="font-semibold">{t.assunto}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <Badge variant={t.status === "resolved" ? "default" : "secondary"}>
                  {t.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
