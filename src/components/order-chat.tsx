import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { validateImageFile } from "@/lib/upload-validation";
import { chatAttachmentPath } from "@/lib/data-access";
import { isLocationEnabled } from "@/lib/device-preferences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, Image as ImageIcon, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { bindResumeRefresh } from "@/lib/resume-refresh";

type Escopo = "client_courier" | "store_courier" | "client_store";
type Role = "cliente" | "estabelecimento" | "entregador";

export type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  sender_role: Role;
  tipo: "text" | "image" | "location" | "audio";
  conteudo: string | null;
  anexo_url: string | null;
  attachmentUrl?: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
};

const QUICK: Record<Role, string[]> = {
  entregador: [
    "Estou a caminho",
    "Cheguei no local",
    "Pedido coletado, saindo agora",
    "Não estou achando o endereço, pode enviar um ponto de referência?",
    "Chegando em 5 minutos",
  ],
  cliente: [
    "Obrigado!",
    "Estou em casa, pode subir",
    "Toque a campainha, por favor",
    "Preciso adicionar uma observação",
  ],
  estabelecimento: [
    "Pedido saindo agora",
    "Vamos precisar de mais alguns minutos",
    "Item indisponível, entraremos em contato",
    "Tudo pronto para retirada",
  ],
};

function mask(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return phone;
  return digits.slice(0, 2) + " " + digits[2] + "****" + digits.slice(-4);
}

async function loadAttachment(message: Message): Promise<Message> {
  const path = chatAttachmentPath(message.anexo_url);
  if (!path) return { ...message, attachmentUrl: null };
  // Storage authorizes the current participant and scope each time this URL is renewed.
  try {
    const { data, error } = await supabase.storage
      .from("chat-attachments")
      .createSignedUrl(path, 5 * 60);
    return { ...message, attachmentUrl: error ? null : (data?.signedUrl ?? null) };
  } catch {
    return { ...message, attachmentUrl: null };
  }
}

function mergeMessages(previous: Message[], incoming: Message[]) {
  return Array.from(
    new Map([...previous, ...incoming].map((message) => [message.id, message])).values(),
  ).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
}

export function OrderChat({
  orderId,
  escopo,
  myRole,
  contactPhone,
  contactName,
}: {
  orderId: string;
  escopo: Escopo;
  myRole: Role;
  contactPhone?: string | null;
  contactName?: string | null;
}) {
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openError, setOpenError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [readyScope, setReadyScope] = useState<string | null>(null);
  const scope = `${orderId}:${escopo}:${myRole}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const generation = useRef(0);
  const sendLock = useRef(false);
  const pendingSend = useRef<{ fingerprint: string; id: string } | null>(null);
  const refreshMessages = useRef<(() => Promise<void>) | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Get or create chat
  useEffect(() => {
    let active = true;
    const request = ++generation.current;
    const current = () =>
      active && request === generation.current && currentScope.current === scope;
    (async () => {
      setLoading(true);
      setOpenError(null);
      setMessageError(null);
      setReadyScope(null);
      setChatId(null);
      setUid(null);
      setMessages([]);
      setText("");
      setSending(false);
      sendLock.current = false;
      pendingSend.current = null;
      try {
        const identity = await supabase.auth.getUser();
        if (!current()) return;
        if (identity.error || !identity.data.user) throw new Error("Authentication required");
        const lookup = () =>
          supabase
            .from("order_chats")
            .select("id")
            .eq("order_id", orderId)
            .eq("escopo", escopo)
            .maybeSingle();
        let result = await lookup();
        if (!current()) return;
        if (result.error) throw result.error;
        if (!result.data) {
          result = await supabase
            .from("order_chats")
            .insert({ order_id: orderId, escopo })
            .select("id")
            .maybeSingle();
          if (!current()) return;
          if (result.error?.code === "23505") result = await lookup();
        }
        if (!current()) return;
        if (result.error || !result.data) throw new Error("Chat unavailable");
        setUid(identity.data.user.id);
        setChatId(result.data.id);
        setReadyScope(scope);
      } catch {
        if (current())
          setOpenError("Não foi possível abrir a conversa. Confira a conexão e tente novamente.");
      } finally {
        if (current()) setLoading(false);
      }
    })();
    return () => {
      active = false;
      generation.current = request + 1;
    };
  }, [orderId, escopo, myRole, scope, retry]);

  // Load + subscribe messages
  useEffect(() => {
    if (!chatId || readyScope !== scope) return;
    const currentChatId = chatId;
    const request = generation.current;
    let active = true;
    let sequence = 0;
    const current = () =>
      active && request === generation.current && currentScope.current === scope;
    async function loadMessages() {
      if (!current()) return;
      const load = ++sequence;
      try {
        const { data, error } = await supabase
          .from("order_messages")
          .select("*")
          .eq("chat_id", currentChatId)
          .order("created_at", { ascending: true });
        if (error) {
          throw error;
        }
        const hydrated = await Promise.all(((data ?? []) as Message[]).map(loadAttachment));
        if (!current() || load !== sequence) return;
        setMessages((previous) => mergeMessages(previous, hydrated));
        setMessageError(null);
        queueMicrotask(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
      } catch {
        if (current() && load === sequence)
          setMessageError("Não foi possível atualizar as mensagens. Tente novamente.");
      }
    }
    refreshMessages.current = loadMessages;
    void loadMessages();
    const detachResume = bindResumeRefresh(loadMessages);
    const renewal = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadMessages();
    }, 15000);
    const ch = supabase
      .channel("order-chat-" + chatId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "order_messages",
          filter: `chat_id=eq.${chatId}`,
        },
        async (p) => {
          const message = await loadAttachment(p.new as Message);
          if (!current()) return;
          setMessages((prev) => mergeMessages(prev, [message]));
          queueMicrotask(() =>
            listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }),
          );
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void loadMessages();
      });
    return () => {
      active = false;
      window.clearInterval(renewal);
      detachResume();
      if (refreshMessages.current === loadMessages) refreshMessages.current = null;
      supabase.removeChannel(ch);
    };
  }, [chatId, scope, readyScope]);

  async function send(
    tipo: Message["tipo"],
    payload: { conteudo?: string; anexo_url?: string; lat?: number; lng?: number },
    prepare?: () => Promise<void>,
  ) {
    if (!chatId || !uid || readyScope !== scope || sendLock.current) return false;
    sendLock.current = true;
    const request = generation.current;
    const current = () => currentScope.current === scope && request === generation.current;
    setSending(true);
    const body = {
      chat_id: chatId,
      sender_id: uid,
      sender_role: myRole,
      tipo,
      conteudo: payload.conteudo ?? null,
      anexo_url: payload.anexo_url ?? null,
      lat: payload.lat ?? null,
      lng: payload.lng ?? null,
    };
    try {
      await prepare?.();
      if (!current()) return false;
      const fingerprint = JSON.stringify(body);
      if (pendingSend.current?.fingerprint !== fingerprint)
        pendingSend.current = { fingerprint, id: crypto.randomUUID() };
      const id = pendingSend.current.id;
      let result = await supabase
        .from("order_messages")
        .insert({ id, ...body })
        .select("*")
        .single();
      if (result.error?.code === "23505") {
        result = await supabase
          .from("order_messages")
          .select("*")
          .eq("id", id)
          .eq("chat_id", chatId)
          .eq("sender_id", uid)
          .single();
      }
      if (result.error || !result.data) throw new Error("Send failed");
      const message = await loadAttachment(result.data as Message);
      if (!current()) return false;
      setMessages((previous) => mergeMessages(previous, [message]));
      pendingSend.current = null;
      queueMicrotask(() =>
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }),
      );
      return true;
    } catch {
      if (current())
        toast.error("Não foi possível enviar. Sua mensagem foi mantida para tentar novamente.");
      return false;
    } finally {
      if (current()) {
        sendLock.current = false;
        setSending(false);
      }
    }
  }

  async function sendText() {
    const t = text.trim();
    if (!t) return;
    if (await send("text", { conteudo: t }))
      setText((previous) => (previous.trim() === t ? "" : previous));
  }

  async function sendImage(file: File) {
    if (!uid || !chatId || sendLock.current || sending) return;
    const invalid = validateImageFile(file);
    if (invalid) return toast.error(invalid);
    const path = `${uid}/${orderId}/${escopo}/${Date.now()}-${file.name}`;
    await send("image", { anexo_url: path }, async () => {
      const { error } = await supabase.storage.from("chat-attachments").upload(path, file);
      if (error) throw error;
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  async function sendLocation() {
    if (!isLocationEnabled())
      return toast.error(
        "Ative a localização nas preferências do dispositivo para compartilhar sua posição.",
      );
    if (!("geolocation" in navigator)) return toast.error("Localização indisponível");
    const request = generation.current;
    const current = () => currentScope.current === scope && request === generation.current;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (current())
          void send("location", { lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        if (current()) toast.error("Não foi possível obter sua localização");
      },
    );
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (openError || readyScope !== scope || !chatId || !uid)
    return (
      <div role="alert" className="space-y-3 rounded-xl border p-4 text-sm">
        <p>{openError ?? "Não foi possível abrir a conversa."}</p>
        <Button onClick={() => setRetry((value) => value + 1)}>Tentar novamente</Button>
      </div>
    );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {(contactName || contactPhone) && (
        <div className="flex items-center justify-between border-b border-border p-3">
          <div>
            <p className="text-sm font-bold">{contactName ?? "Contato"}</p>
            {contactPhone && (
              <p className="text-xs text-muted-foreground">Tel: {mask(contactPhone)}</p>
            )}
          </div>
          {contactPhone && (
            <a href={`tel:${contactPhone}`}>
              <Button size="sm" variant="outline">
                <Phone className="mr-2 h-3 w-3" />
                Ligar
              </Button>
            </a>
          )}
        </div>
      )}

      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {messageError && (
          <div role="alert" className="space-y-2 text-sm text-destructive">
            <p>{messageError}</p>
            <Button variant="outline" onClick={() => void refreshMessages.current?.()}>
              Tentar novamente
            </Button>
          </div>
        )}
        {messages.length === 0 && !messageError && (
          <p className="mt-16 text-center text-sm text-muted-foreground">
            Envie a primeira mensagem
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === uid;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                {m.tipo === "text" && (
                  <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>
                )}
                {m.tipo === "image" && m.attachmentUrl && (
                  <a href={m.attachmentUrl} target="_blank" rel="noopener noreferrer">
                    <img src={m.attachmentUrl} alt="anexo" className="max-h-60 rounded-lg" />
                  </a>
                )}
                {m.tipo === "image" && !m.attachmentUrl && (
                  <p className="text-xs opacity-70">Anexo indisponível</p>
                )}
                {m.tipo === "location" && m.lat != null && m.lng != null && (
                  <a
                    href={`https://www.google.com/maps?q=${m.lat},${m.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 underline"
                  >
                    <MapPin className="h-3.5 w-3.5" /> Ver localização no mapa
                  </a>
                )}
                <p className="mt-1 text-[10px] opacity-70">
                  {new Date(m.created_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border p-2">
        <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
          {QUICK[myRole].map((q) => (
            <button
              key={q}
              type="button"
              disabled={sending}
              onClick={() => send("text", { conteudo: q })}
              className="whitespace-nowrap rounded-full border border-border bg-background px-3 py-1 text-xs hover:bg-primary hover:text-primary-foreground"
            >
              {q}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && sendImage(e.target.files[0])}
          />
          <Button
            size="icon"
            variant="outline"
            aria-label="Enviar imagem"
            onClick={() => fileRef.current?.click()}
            disabled={sending}
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label="Compartilhar localização"
            onClick={sendLocation}
            disabled={sending}
          >
            <MapPin className="h-4 w-4" />
          </Button>
          <Input
            placeholder="Escreva uma mensagem…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendText())}
            disabled={sending}
          />
          <Button
            size="icon"
            aria-label="Enviar mensagem"
            onClick={sendText}
            disabled={sending || !text.trim()}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
