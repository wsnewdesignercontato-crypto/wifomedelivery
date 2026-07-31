import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { validateImageFile } from "@/lib/upload-validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, Image as ImageIcon, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";

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
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, []);

  // Get or create chat
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: existing } = await supabase
        .from("order_chats")
        .select("id")
        .eq("order_id", orderId)
        .eq("escopo", escopo)
        .maybeSingle();
      if (existing) {
        setChatId(existing.id);
      } else {
        const { data: created, error } = await supabase
          .from("order_chats")
          .insert({ order_id: orderId, escopo })
          .select("id")
          .maybeSingle();
        if (error) toast.error("Não foi possível abrir o chat");
        else setChatId(created?.id ?? null);
      }
      setLoading(false);
    })();
  }, [orderId, escopo]);

  // Load + subscribe messages
  useEffect(() => {
    if (!chatId) return;
    (async () => {
      const { data } = await supabase
        .from("order_messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });
      setMessages((data ?? []) as Message[]);
      queueMicrotask(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    })();
    const ch = supabase
      .channel("order-chat-" + chatId)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_messages", filter: `chat_id=eq.${chatId}` },
        (p) => {
          setMessages((prev) => [...prev, p.new as Message]);
          queueMicrotask(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [chatId]);

  async function send(tipo: Message["tipo"], payload: { conteudo?: string; anexo_url?: string; lat?: number; lng?: number }) {
    if (!chatId || !uid) return;
    setSending(true);
    const { error } = await supabase.from("order_messages").insert({
      chat_id: chatId,
      sender_id: uid,
      sender_role: myRole,
      tipo,
      conteudo: payload.conteudo ?? null,
      anexo_url: payload.anexo_url ?? null,
      lat: payload.lat ?? null,
      lng: payload.lng ?? null,
    });
    setSending(false);
    if (error) toast.error("Falha ao enviar");
  }

  async function sendText() {
    const t = text.trim();
    if (!t) return;
    setText("");
    await send("text", { conteudo: t });
  }

  async function sendImage(file: File) {
    if (!uid) return;
    const invalid = validateImageFile(file);
    if (invalid) return toast.error(invalid);
    const path = `${uid}/${orderId}/${Date.now()}-${file.name}`;
    setSending(true);
    const { error: upErr } = await supabase.storage.from("chat-attachments").upload(path, file);
    if (upErr) { setSending(false); return toast.error("Falha ao enviar imagem"); }
    const { data: signed } = await supabase.storage.from("chat-attachments").createSignedUrl(path, 60 * 60 * 24 * 7);
    await send("image", { anexo_url: signed?.signedUrl ?? path });
    setSending(false);
  }

  async function sendLocation() {
    if (!("geolocation" in navigator)) return toast.error("Localização indisponível");
    navigator.geolocation.getCurrentPosition(
      (pos) => send("location", { lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => toast.error("Não foi possível obter sua localização"),
    );
  }

  if (loading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex h-full min-h-[420px] flex-col rounded-2xl border border-border bg-card">
      {(contactName || contactPhone) && (
        <div className="flex items-center justify-between border-b border-border p-3">
          <div>
            <p className="text-sm font-bold">{contactName ?? "Contato"}</p>
            {contactPhone && <p className="text-xs text-muted-foreground">Tel: {mask(contactPhone)}</p>}
          </div>
          {contactPhone && (
            <a href={`tel:${contactPhone}`}>
              <Button size="sm" variant="outline"><Phone className="mr-2 h-3 w-3" />Ligar</Button>
            </a>
          )}
        </div>
      )}

      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="mt-16 text-center text-sm text-muted-foreground">Envie a primeira mensagem</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === uid;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {m.tipo === "text" && <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>}
                {m.tipo === "image" && m.anexo_url && (
                  <a href={m.anexo_url} target="_blank" rel="noopener noreferrer">
                    <img src={m.anexo_url} alt="anexo" className="max-h-60 rounded-lg" />
                  </a>
                )}
                {m.tipo === "location" && m.lat != null && m.lng != null && (
                  <a
                    href={`https://www.google.com/maps?q=${m.lat},${m.lng}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 underline"
                  >
                    <MapPin className="h-3.5 w-3.5" /> Ver localização no mapa
                  </a>
                )}
                <p className="mt-1 text-[10px] opacity-70">
                  {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
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
              key={q} type="button"
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
          <Button size="icon" variant="outline" onClick={() => fileRef.current?.click()} disabled={sending}>
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={sendLocation} disabled={sending}>
            <MapPin className="h-4 w-4" />
          </Button>
          <Input
            placeholder="Escreva uma mensagem…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendText())}
            disabled={sending}
          />
          <Button size="icon" onClick={sendText} disabled={sending || !text.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
