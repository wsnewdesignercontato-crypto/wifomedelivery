import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab, fmt } from "@/hooks/use-my-estab";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { OrderHistory } from "@/components/order-history";
import { Bike, ReceiptText, Printer, Phone, User, MapPin, Settings as SettingsIcon } from "lucide-react";
import { printOrderReceipt } from "@/lib/print-receipt";

export const Route = createFileRoute("/_authenticated/estabelecimento/pedidos")({
  component: PedidosPage,
});

type Addon = { id?: string; nome: string; preco_extra_cents?: number; group_nome?: string };
type Order = {
  id: string; cliente_id: string; status: string; total_cents: number;
  subtotal_cents: number; frete_cents: number; desconto_cents: number;
  forma_pagamento: string; troco_para_cents: number | null; codigo_entrega: string | null;
  observacoes: string | null; created_at: string;
  endereco_entrega: { rua?: string; numero?: string | null; complemento?: string | null; bairro?: string | null; cidade?: string; estado?: string | null; cep?: string | null } | null;
  tipo_entrega: "delivery" | "pickup" | null;
  cancellation_reason?: string | null; cancelled_role?: string | null;
  refund_status?: string | null; refund_amount_cents?: number | null;
};
type OrderItem = { id: string; order_id: string; nome_snapshot: string; quantidade: number; preco_unit_cents: number; observacoes: string | null; addons: Addon[] };
type Contact = { nome: string | null; telefone: string | null };

const STATUS_LABEL: Record<string, string> = {
  placed: "Novo", accepted: "Aceito", preparing: "Em preparo", ready: "Pronto",
  waiting_courier: "Aguardando entregador", courier_assigned: "Entregador a caminho",
  picked_up: "Coletado", on_the_way: "A caminho", arriving: "Chegando",
  delivered: "Entregue", cancelled: "Cancelado", refunded: "Reembolsado",
};
const PAY_LABEL: Record<string, string> = { pix: "PIX", cartao: "Cartão", dinheiro: "Dinheiro", carteira: "Carteira" };
const TERMINAL = new Set(["delivered", "cancelled", "refunded"]);

function PedidosPage() {
  const { estab } = useMyEstab();
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [openHistory, setOpenHistory] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>("todos");
  const printedRef = useRef<Set<string>>(new Set());

  async function loadContact(orderId: string) {
    if (contacts[orderId]) return contacts[orderId];
    const { data } = await supabase.rpc("get_order_client_contact", { _order_id: orderId });
    const row = Array.isArray(data) ? data[0] : null;
    const c: Contact = { nome: row?.nome ?? null, telefone: row?.telefone ?? null };
    setContacts((p) => ({ ...p, [orderId]: c }));
    return c;
  }

  async function reload() {
    if (!estab) return;
    const { data } = await supabase
      .from("orders")
      .select("id,cliente_id,status,total_cents,subtotal_cents,frete_cents,desconto_cents,forma_pagamento,troco_para_cents,codigo_entrega,observacoes,created_at,endereco_entrega,tipo_entrega,cancellation_reason,cancelled_role,refund_status,refund_amount_cents")
      .eq("establishment_id", estab.id)
      .order("created_at", { ascending: false })
      .limit(80);
    const list = (data ?? []) as Order[];
    setOrders(list);
    if (list.length) {
      const ids = list.map((o) => o.id);
      const { data: it } = await supabase.from("order_items").select("*").in("order_id", ids);
      const g: Record<string, OrderItem[]> = {};
      (it ?? []).forEach((r) => {
        const row = r as unknown as OrderItem;
        row.addons = Array.isArray(row.addons) ? row.addons : [];
        (g[row.order_id] ??= []).push(row);
      });
      setItems(g);
      // Pré-carrega contatos dos pedidos ativos (não terminais) para a exibição.
      list.filter((o) => !TERMINAL.has(o.status)).slice(0, 20).forEach((o) => { void loadContact(o.id); });
    }
  }

  useEffect(() => {
    if (!estab) return;
    reload();
    const ch = supabase
      .channel("estab-pedidos-" + estab.id)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `establishment_id=eq.${estab.id}` },
        (payload) => {
          reload();
          toast.info("Pedido atualizado");
          // Auto-print em novos pedidos, se habilitado
          if (
            estab.printer_enabled && estab.printer_auto &&
            payload.eventType === "INSERT" &&
            (payload.new as { status?: string })?.status === "placed"
          ) {
            const oid = (payload.new as { id?: string })?.id;
            if (oid && !printedRef.current.has(oid)) {
              printedRef.current.add(oid);
              setTimeout(() => imprimir(oid), 800);
            }
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estab?.id, estab?.printer_enabled, estab?.printer_auto]);

  async function mudarStatus(id: string, novo: "accepted" | "preparing" | "ready") {
    const { error } = await supabase.from("orders").update({ status: novo }).eq("id", id);
    if (error) return toast.error("Falha ao atualizar");
    if (novo === "ready" && estab) {
      await supabase.from("deliveries").insert({
        order_id: id, status: "broadcasting",
        valor_entrega_cents: estab.taxa_entrega_cents,
      });
      await supabase.from("orders").update({ status: "waiting_courier" }).eq("id", id);
      toast.success("Corrida enviada aos entregadores");
    } else toast.success("Status atualizado");
  }

  async function cancelar(id: string) {
    const motivo = prompt("Motivo do cancelamento:") ?? "";
    if (!motivo.trim() || !estab) return;
    const { error } = await supabase.from("orders").update({
      status: "cancelled", cancellation_reason: motivo.trim(),
      cancelled_by: estab.owner_id, cancelled_role: "estabelecimento",
    }).eq("id", id);
    if (error) toast.error("Falha ao cancelar"); else toast.success("Pedido cancelado");
  }

  async function reembolsar(o: Order) {
    const s = prompt("Valor a reembolsar (R$):", (o.total_cents / 100).toFixed(2)) ?? "";
    const v = Math.round(parseFloat(s.replace(",", ".")) * 100);
    if (!Number.isFinite(v) || v <= 0 || v > o.total_cents) return toast.error("Valor inválido");
    const { error } = await supabase.from("orders").update({
      status: "refunded", refund_status: "completed", refund_amount_cents: v,
    }).eq("id", o.id);
    if (error) toast.error("Falha"); else toast.success("Reembolso registrado");
  }

  async function imprimir(orderId: string) {
    if (!estab) return;
    const order = orders.find((o) => o.id === orderId);
    let its = items[orderId];
    if (!order || !its) {
      const { data: o } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
      const { data: it } = await supabase.from("order_items").select("*").eq("order_id", orderId);
      if (!o || !it) return toast.error("Pedido não encontrado");
      its = (it as unknown as OrderItem[]).map((r) => ({ ...r, addons: Array.isArray(r.addons) ? r.addons : [] }));
    }
    const contact = await loadContact(orderId);
    const ok = printOrderReceipt(
      order ?? { ...(await supabase.from("orders").select("*").eq("id", orderId).single()).data } as unknown as Order,
      its,
      { nome: estab.nome, telefone: estab.telefone, endereco: estab.endereco, cnpj: estab.cnpj },
      contact,
      estab.printer_width_mm ?? 80,
    );
    if (!ok) toast.error("Bloqueie o pop-up para imprimir");
  }

  const proxima = (s: string) => {
    if (s === "placed") return { label: "Aceitar", next: "accepted" as const };
    if (s === "accepted") return { label: "Iniciar preparo", next: "preparing" as const };
    if (s === "preparing") return { label: "Pronto e chamar entregador", next: "ready" as const };
    return null;
  };

  const FILTROS = [
    { key: "todos", label: "Todos" },
    { key: "placed", label: "Novos" },
    { key: "preparing", label: "Em preparo" },
    { key: "ready", label: "Prontos" },
    { key: "on_the_way", label: "A caminho" },
    { key: "delivered", label: "Entregues" },
    { key: "cancelled", label: "Cancelados" },
  ];
  const lista = filter === "todos" ? orders : orders.filter((o) => o.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Central de pedidos</h1>
          <p className="text-sm text-muted-foreground">Atualização em tempo real.</p>
        </div>
        <PrinterSettingsDialog />
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"} onClick={() => setFilter(f.key)}>
            {f.label}
          </Button>
        ))}
      </div>
      {lista.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <ReceiptText className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Nenhum pedido nesta aba.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map((o) => {
            const step = proxima(o.status);
            const isDelivered = o.status === "delivered";
            const isProblem = o.status === "cancelled" || o.status === "refunded" || o.refund_status === "completed";
            const tone = isProblem
              ? { card: "border-red-500/60 bg-red-500/5", badge: "bg-red-500 text-white hover:bg-red-500/90", value: "text-red-600 dark:text-red-400", accent: "before:bg-red-500" }
              : isDelivered
              ? { card: "border-emerald-500/60 bg-emerald-500/5", badge: "bg-emerald-500 text-white hover:bg-emerald-500/90", value: "text-emerald-600 dark:text-emerald-400", accent: "before:bg-emerald-500" }
              : { card: "border-primary/50 bg-primary/5", badge: "bg-primary text-primary-foreground hover:bg-primary/90", value: "text-primary", accent: "before:bg-primary" };
            const contact = contacts[o.id];
            const addr = o.endereco_entrega;
            const enderecoStr = addr
              ? [[addr.rua, addr.numero].filter(Boolean).join(", "), addr.complemento, addr.bairro, [addr.cidade, addr.estado].filter(Boolean).join("/"), addr.cep].filter(Boolean).join(" · ")
              : null;
            return (
              <div key={o.id} className={cn("relative overflow-hidden rounded-2xl border bg-card p-4 shadow-card transition", tone.card, "before:absolute before:left-0 before:top-0 before:h-full before:w-1.5", tone.accent)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={tone.badge}>{STATUS_LABEL[o.status] ?? o.status}</Badge>
                      <Badge variant="outline" className={o.tipo_entrega === "pickup" ? "border-amber-500/50 text-amber-600" : "border-primary/40 text-primary"}>
                        {o.tipo_entrega === "pickup" ? "🏪 Retirada" : "🛵 Entrega"}
                      </Badge>
                      <Badge variant="secondary">{PAY_LABEL[o.forma_pagamento] ?? o.forma_pagamento}</Badge>
                      {o.refund_status === "completed" && (<Badge className="bg-red-500/15 text-red-600 hover:bg-red-500/20 dark:text-red-400">Reembolso {fmt(o.refund_amount_cents ?? 0)}</Badge>)}
                      <span className="text-xs text-muted-foreground">#{o.id.slice(0, 8).toUpperCase()} · {new Date(o.created_at).toLocaleTimeString("pt-BR")}</span>
                    </div>
                  </div>
                  <span className={cn("shrink-0 whitespace-nowrap font-bold", tone.value)}>{fmt(o.total_cents)}</span>
                </div>

                {/* Bloco cliente / endereço */}
                <div className="mt-3 rounded-xl bg-muted/60 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5" /><span className="font-semibold">{contact?.nome ?? "Carregando..."}</span></span>
                    {contact?.telefone && (
                      <a href={`tel:${contact.telefone}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                        <Phone className="h-3.5 w-3.5" />{contact.telefone}
                      </a>
                    )}
                  </div>
                  <div className="mt-1 flex items-start gap-1.5 text-muted-foreground">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{o.tipo_entrega === "pickup" ? "Cliente retira no local" : (enderecoStr ?? "—")}</span>
                  </div>
                  {o.troco_para_cents ? <div className="mt-1 text-xs">💵 Troco para <strong>{fmt(o.troco_para_cents)}</strong></div> : null}
                </div>

                {/* Itens com opcionais */}
                <ul className="mt-3 space-y-2 text-sm">
                  {(items[o.id] ?? []).map((it) => (
                    <li key={it.id} className="rounded-lg border border-border/60 bg-background/40 p-2">
                      <div className="flex justify-between font-medium">
                        <span>{it.quantidade}× {it.nome_snapshot}</span>
                        <span className="text-muted-foreground">{fmt(it.preco_unit_cents * it.quantidade)}</span>
                      </div>
                      {it.addons.length > 0 && (
                        <ul className="mt-1 space-y-0.5 pl-4 text-xs text-muted-foreground">
                          {it.addons.map((a, idx) => (
                            <li key={idx} className="flex justify-between">
                              <span>+ {a.group_nome ? <span className="opacity-70">[{a.group_nome}]</span> : null} {a.nome}</span>
                              {a.preco_extra_cents ? <span>{fmt(a.preco_extra_cents)}</span> : null}
                            </li>
                          ))}
                        </ul>
                      )}
                      {it.observacoes && (
                        <p className="mt-1 rounded bg-amber-500/10 px-2 py-1 text-xs italic text-amber-700 dark:text-amber-400">
                          Obs: {it.observacoes}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>

                {o.observacoes && (<p className="mt-2 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300"><strong>Observação do pedido:</strong> {o.observacoes}</p>)}
                {o.status === "cancelled" && o.cancellation_reason && (
                  <p className="mt-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                    Cancelado{o.cancelled_role ? ` (${o.cancelled_role})` : ""}: {o.cancellation_reason}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {step && (<Button size="sm" onClick={() => mudarStatus(o.id, step.next)}>{step.next === "ready" && <Bike className="mr-2 h-4 w-4" />}{step.label}</Button>)}
                  <Button size="sm" variant="outline" onClick={() => imprimir(o.id)}><Printer className="mr-2 h-4 w-4" />Imprimir</Button>
                  {!TERMINAL.has(o.status) && (<Button size="sm" variant="outline" onClick={() => cancelar(o.id)}>Cancelar</Button>)}
                  {(o.status === "cancelled" || o.status === "delivered") && o.refund_status !== "completed" && (
                    <Button size="sm" variant="secondary" onClick={() => reembolsar(o)}>Reembolsar</Button>
                  )}
                  <Button size="sm" variant="ghost" className="ml-auto"
                    onClick={() => setOpenHistory((p) => { const n = new Set(p); n.has(o.id) ? n.delete(o.id) : n.add(o.id); return n; })}>
                    {openHistory.has(o.id) ? "Ocultar histórico" : "Ver histórico"}
                  </Button>
                </div>
                {openHistory.has(o.id) && (
                  <div className="mt-4 border-t border-border pt-4"><OrderHistory orderId={o.id} /></div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PrinterSettingsDialog() {
  const { estab } = useMyEstab();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [auto, setAuto] = useState(false);
  const [width, setWidth] = useState("80");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!estab) return;
    setEnabled(!!estab.printer_enabled);
    setAuto(!!estab.printer_auto);
    setWidth(String(estab.printer_width_mm ?? 80));
  }, [estab?.id, estab?.printer_enabled, estab?.printer_auto, estab?.printer_width_mm]);

  async function salvar() {
    if (!estab) return;
    setSaving(true);
    const w = parseInt(width) === 58 ? 58 : 80;
    const { error } = await supabase.from("establishments").update({
      printer_enabled: enabled, printer_auto: auto, printer_width_mm: w,
    }).eq("id", estab.id);
    setSaving(false);
    if (error) return toast.error("Falha ao salvar");
    toast.success("Impressora configurada");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Printer className="mr-2 h-4 w-4" />Impressora</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><SettingsIcon className="h-4 w-4" /> Impressão de pedidos</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            O WiFome imprime em <strong>qualquer impressora instalada no seu computador ou celular</strong> (USB, rede ou Bluetooth). Basta que ela apareça na lista de impressoras do sistema. Para impressoras térmicas de 58/80mm, selecione a largura correta.
          </p>
          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="font-semibold text-sm">Ativar botão de impressão</p>
              <p className="text-xs text-muted-foreground">Habilita "Imprimir" em cada pedido.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="font-semibold text-sm">Impressão automática</p>
              <p className="text-xs text-muted-foreground">Abre o cupom automaticamente quando entra um pedido novo.</p>
            </div>
            <Switch checked={auto} onCheckedChange={setAuto} disabled={!enabled} />
          </div>
          <div>
            <Label>Largura do papel</Label>
            <div className="mt-1 flex gap-2">
              {["58", "80"].map((v) => (
                <Button key={v} type="button" variant={width === v ? "default" : "outline"} size="sm" onClick={() => setWidth(v)}>
                  {v}mm
                </Button>
              ))}
              <Input value={width} onChange={(e) => setWidth(e.target.value)} className="w-20" />
            </div>
          </div>
          <Button className="w-full" onClick={salvar} disabled={saving}>Salvar configurações</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
