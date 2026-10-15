import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, HelpCircle, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/cliente/perfil/ajuda")({
  head: () => ({
    meta: [
      { title: "Cliente — Perfil — Ajuda | PedeTrem" },
      { name: "description", content: "PedeTrem: cliente, perfil, ajuda." },
      { property: "og:title", content: "Cliente — Perfil — Ajuda | PedeTrem" },
      { property: "og:description", content: "PedeTrem: cliente, perfil, ajuda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AjudaPage,
});

const FAQS = [
  {
    q: "Como acompanhar meu pedido?",
    a: "Vá em Pedidos e toque no pedido em andamento. Você verá o mapa em tempo real e o status atualizado.",
  },
  {
    q: "Posso cancelar um pedido?",
    a: "As ações disponíveis aparecem no pedido conforme sua etapa. Para solicitar ajuda após o aceite, registre uma solicitação abaixo.",
  },
  {
    q: "Como funciona o código de entrega?",
    a: "Informe os 4 dígitos ao entregador na hora da entrega para confirmar que o pedido chegou até você.",
  },
  {
    q: "Como pedir reembolso?",
    a: "Registre uma solicitação abaixo com o número do pedido. A equipe poderá avaliar o atendimento e o pagamento realizado.",
  },
];

function AjudaPage() {
  const [open, setOpen] = useState<number | null>(0);
  const { user } = Route.useRouteContext();
  const [assunto, setAssunto] = useState("");
  const [sending, setSending] = useState(false);
  const [tickets, setTickets] = useState<{ id: string; assunto: string; status: string }[]>([]);
  useEffect(() => {
    let active = true;
    supabase
      .from("support_tickets")
      .select("id,assunto,status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (active) {
          if (error) toast.error("Não foi possível carregar as solicitações");
          else setTickets(data ?? []);
        }
      });
    return () => {
      active = false;
    };
  }, [user.id]);
  async function send() {
    if (sending || !assunto.trim()) return;
    setSending(true);
    try {
      const { data, error } = await supabase
        .from("support_tickets")
        .insert({ user_id: user.id, assunto: assunto.trim() })
        .select("id,assunto,status")
        .single();
      if (error || !data) throw new Error("Não foi possível registrar a solicitação");
      setTickets((prev) => [data, ...prev]);
      setAssunto("");
      toast.success("Solicitação registrada. A equipe poderá consultá-la no suporte.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no atendimento");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link
        to="/cliente/perfil"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <HelpCircle className="h-5 w-5 text-primary" /> Ajuda e suporte
      </h1>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">Falar com a equipe</h2>
        <p className="text-sm text-muted-foreground">
          Registre uma dúvida sobre o pedido, sua conta ou seus dados. Não inclua senhas ou códigos
          de autenticação.
        </p>
        <label htmlFor="support-subject" className="block text-sm">
          Sua solicitação
        </label>
        <Textarea
          id="support-subject"
          value={assunto}
          onChange={(e) => setAssunto(e.target.value)}
          maxLength={500}
          placeholder="Descreva o que precisa, incluindo o número do pedido se houver."
        />
        <Button disabled={sending || !assunto.trim()} onClick={() => void send()}>
          {sending ? "Registrando…" : "Registrar solicitação"}
        </Button>
        <h3 className="pt-2 text-sm font-semibold">Minhas solicitações</h3>
        {tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma solicitação registrada.</p>
        ) : (
          tickets.map((t) => (
            <div key={t.id} className="border-t py-2 text-sm">
              <p>{t.assunto}</p>
              <p className="text-xs text-muted-foreground">
                Protocolo {t.id.slice(0, 8)} · {t.status}
              </p>
            </div>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Perguntas frequentes
        </h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={i} className={i > 0 ? "border-t border-border" : ""}>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left"
                >
                  <span className="text-sm font-semibold">{f.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen && <p className="px-4 pb-4 text-xs text-muted-foreground">{f.a}</p>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
