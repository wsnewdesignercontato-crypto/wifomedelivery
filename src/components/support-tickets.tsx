import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useDevicePreferences } from "@/hooks/use-device-preferences";

type Contacts = { email?: string | null; whatsapp?: string | null; phone?: string | null };

export function SupportContacts() {
  const { data, isError } = useQuery({
    queryKey: ["support-contacts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_support_contacts");
      if (error) throw error;
      return data as Contacts | null;
    },
    staleTime: 60_000,
  });
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {data?.whatsapp && (
        <a
          className="underline"
          href={`https://wa.me/${data.whatsapp}`}
          target="_blank"
          rel="noreferrer"
        >
          WhatsApp do suporte
        </a>
      )}
      {data?.email && (
        <a className="underline" href={`mailto:${data.email}`}>
          E-mail: {data.email}
        </a>
      )}
      {data?.phone && (
        <a className="underline" href={`tel:${data.phone}`}>
          Telefone: {data.phone}
        </a>
      )}
      {(isError || (!data?.email && !data?.whatsapp && !data?.phone)) && (
        <p className="text-muted-foreground">Fale com a equipe pelos chamados abaixo.</p>
      )}
    </div>
  );
}

const STATUS: Record<string, string> = {
  open: "Aberto",
  pending: "Em atendimento",
  resolved: "Resolvido",
  closed: "Encerrado",
};

export function SupportTickets() {
  const { prefs } = useDevicePreferences();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: uid } = useQuery({
    queryKey: ["support-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });
  const tickets = useQuery({
    queryKey: ["my-support-tickets", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("id,assunto,status,created_at")
        .eq("user_id", uid!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: prefs.economia_dados ? 60_000 : 30_000,
  });
  const messages = useQuery({
    queryKey: ["my-support-messages", selectedId, uid],
    enabled: !!selectedId && !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("id,sender_id,mensagem,created_at")
        .eq("ticket_id", selectedId!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    refetchInterval: prefs.economia_dados ? 60_000 : 15_000,
  });
  useEffect(() => {
    if (!selectedId) return;
    const channel = supabase
      .channel(`my-support-${selectedId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `ticket_id=eq.${selectedId}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["my-support-messages", selectedId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedId, qc]);

  async function create() {
    if (busy || subject.trim().length < 3 || !message.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_support_ticket", {
        p_assunto: subject.trim(),
        p_mensagem: message.trim(),
      });
      if (error) throw error;
      setSubject("");
      setMessage("");
      setSelectedId(data);
      await qc.invalidateQueries({ queryKey: ["my-support-tickets"] });
      toast.success("Chamado aberto. A resposta aparecerá nesta conversa.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o chamado");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (busy || !uid || !selectedId || !reply.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("support_messages")
        .insert({ ticket_id: selectedId, sender_id: uid, mensagem: reply.trim() });
      if (error) throw error;
      setReply("");
      await qc.invalidateQueries({ queryKey: ["my-support-messages", selectedId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar a mensagem");
    } finally {
      setBusy(false);
    }
  }

  const selected = tickets.data?.find((ticket) => ticket.id === selectedId);
  return (
    <div className="space-y-5">
      <SupportContacts />
      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <h2 className="font-semibold">Abrir chamado</h2>
        <div>
          <Label htmlFor="support-subject">Assunto</Label>
          <Input
            id="support-subject"
            value={subject}
            maxLength={160}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="support-message">Mensagem</Label>
          <Textarea
            id="support-message"
            value={message}
            maxLength={5000}
            rows={3}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        <Button
          disabled={busy || subject.trim().length < 3 || !message.trim()}
          onClick={() => void create()}
        >
          Enviar chamado
        </Button>
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Meus chamados</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void tickets.refetch();
              void messages.refetch();
            }}
          >
            Atualizar
          </Button>
        </div>
        {tickets.isError && (
          <p role="alert">Não foi possível carregar os chamados. Tente atualizar.</p>
        )}
        {tickets.isLoading && <p>Carregando chamados…</p>}
        {tickets.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum chamado aberto.</p>
        )}
        {tickets.data?.map((ticket) => (
          <button
            type="button"
            key={ticket.id}
            onClick={() => {
              setSelectedId(ticket.id);
              setReply("");
            }}
            aria-pressed={selectedId === ticket.id}
            className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left ${selectedId === ticket.id ? "border-primary bg-primary/5" : "bg-card"}`}
          >
            <span>{ticket.assunto}</span>
            <span className="text-xs text-muted-foreground">
              {STATUS[ticket.status] ?? ticket.status}
            </span>
          </button>
        ))}
      </section>
      {selected && (
        <section className="space-y-3 rounded-2xl border bg-card p-4">
          <h2 className="font-semibold">{selected.assunto}</h2>
          <div className="max-h-96 space-y-3 overflow-y-auto" aria-live="polite">
            {messages.isLoading && <p>Carregando conversa…</p>}
            {messages.isError && <p role="alert">Falha ao carregar a conversa. Tente atualizar.</p>}
            {messages.data?.map((entry) => (
              <article key={entry.id} className="rounded-xl bg-muted p-3">
                <p className="text-xs font-semibold">
                  {entry.sender_id === uid ? "Você" : "Equipe de suporte"}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">{entry.mensagem}</p>
                <time className="text-xs text-muted-foreground">
                  {new Date(entry.created_at).toLocaleString("pt-BR")}
                </time>
              </article>
            ))}
          </div>
          <Label htmlFor="support-reply">Responder</Label>
          <Textarea
            id="support-reply"
            value={reply}
            maxLength={5000}
            onChange={(e) => setReply(e.target.value)}
          />
          <Button disabled={busy || !reply.trim()} onClick={() => void send()}>
            Enviar resposta
          </Button>
        </section>
      )}
    </div>
  );
}
