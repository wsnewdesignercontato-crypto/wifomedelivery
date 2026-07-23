import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, MapPin, Package, CheckCircle2, XCircle, Bike, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReviewForm } from "@/components/reviews";

export const Route = createFileRoute("/_authenticated/cliente/pedido/$id")({
  component: PedidoPage,
});

type Order = {
  id: string;
  status: string;
  subtotal_cents: number;
  frete_cents: number;
  desconto_cents: number;
  total_cents: number;
  observacoes: string | null;
  cancellation_reason: string | null;
  refund_status: string;
  refund_amount_cents: number;
  establishment_id: string;
  forma_pagamento: string;
  codigo_entrega: string | null;
  tipo_entrega: "delivery" | "pickup" | null;
  created_at: string;
};
type Item = { id: string; nome_snapshot: string; preco_unit_cents: number; quantidade: number; observacoes: string | null };
type Delivery = { id: string; status: string; entregador_id: string | null; lat: number | null; lng: number | null };

const STAGES = [
  { key: "placed", label: "Pedido recebido" },
  { key: "accepted", label: "Aceito pela loja" },
  { key: "preparing", label: "Em preparo" },
  { key: "ready", label: "Pronto" },
  { key: "courier_assigned", label: "Entregador designado" },
  { key: "picked_up", label: "Coletado" },
  { key: "on_the_way", label: "A caminho" },
  { key: "delivered", label: "Entregue" },
] as const;

const CANCELABLE = new Set(["placed", "accepted"]);

const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function PedidoPage() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loja, setLoja] = useState<{ id: string; nome: string } | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewed, setReviewed] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: o } = await supabase
        .from("orders")
        .select("id,status,subtotal_cents,frete_cents,desconto_cents,total_cents,observacoes,cancellation_reason,refund_status,refund_amount_cents,establishment_id,forma_pagamento,codigo_entrega,tipo_entrega,created_at")
        .eq("id", id)
        .maybeSingle();
      setOrder(o as Order | null);
      if (!o) { setLoading(false); return; }
      const [it, e, d, r] = await Promise.all([
        supabase.from("order_items").select("id,nome_snapshot,preco_unit_cents,quantidade,observacoes").eq("order_id", id),
        supabase.from("establishments").select("id,nome").eq("id", (o as Order).establishment_id).maybeSingle(),
        supabase.from("deliveries").select("id,status,entregador_id,lat,lng").eq("order_id", id).maybeSingle(),
        supabase.from("reviews").select("id").eq("order_id", id).maybeSingle(),
      ]);
      setItems((it.data ?? []) as Item[]);
      setLoja(e.data as { id: string; nome: string } | null);
      setDelivery(d.data as Delivery | null);
      setReviewed(!!r.data);
      setLoading(false);
    }
    load();

    const ch = supabase
      .channel(`pedido-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` }, (p) => setOrder((prev) => prev ? { ...prev, ...(p.new as Order) } : prev))
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries", filter: `order_id=eq.${id}` }, (p) => setDelivery(p.new as Delivery))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tracking_points", filter: `order_id=eq.${id}` }, (p) => {
        const t = p.new as { lat: number; lng: number };
        setDelivery((prev) => prev ? { ...prev, lat: t.lat, lng: t.lng } : prev);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  async function cancelar() {
    const motivo = prompt("Motivo do cancelamento (opcional):") ?? "";
    if (!confirm("Cancelar este pedido?")) return;
    const { error } = await supabase.from("orders").update({
      status: "cancelled",
      cancellation_reason: motivo || null,
      cancelled_by: user.id,
      cancelled_role: "cliente",
    }).eq("id", id);
    if (error) toast.error("Loja já iniciou o preparo — não é mais possível cancelar.");
    else toast.success("Pedido cancelado");
  }


  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!order) return <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">Pedido não encontrado.</div>;

  const stageIdx = STAGES.findIndex((s) => s.key === order.status);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="ghost" onClick={() => navigate({ to: "/cliente/pedidos" })} aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">{loja?.nome ?? "Pedido"}</h1>
          <p className="text-xs text-muted-foreground">#{order.id.slice(0, 8)} · {new Date(order.created_at).toLocaleString("pt-BR")}</p>
          <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-semibold text-primary">
            {order.tipo_entrega === "pickup" ? <><Store className="h-3 w-3" /> Retirada no local</> : <><Bike className="h-3 w-3" /> Entrega</>}
          </div>
        </div>
      </div>

      {order.codigo_entrega && !["delivered","cancelled","refunded"].includes(order.status) && (
        <div className="rounded-2xl border-2 border-primary bg-gradient-to-br from-primary/10 to-primary/5 p-5 text-center shadow-lg">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            {order.tipo_entrega === "pickup" ? "Código de retirada" : "Código de entrega"}
          </p>
          <p className="mt-2 text-5xl font-black tracking-[0.5em] text-primary">{order.codigo_entrega}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {order.tipo_entrega === "pickup"
              ? "Informe este código na loja ao retirar o pedido."
              : "Informe este código ao entregador para confirmar o recebimento."}
          </p>
        </div>
      )}

      {order.status === "cancelled" ? (
        <div className="rounded-2xl border border-destructive/50 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 text-destructive"><XCircle className="h-5 w-5" /><span className="font-semibold">Pedido cancelado</span></div>
          {order.cancellation_reason && <p className="mt-1 text-xs">{order.cancellation_reason}</p>}
        </div>
      ) : order.status === "delivered" ? (
        <div className="rounded-2xl border border-success/50 bg-success/10 p-4">
          <div className="flex items-center gap-2 text-success">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-semibold">Pedido entregue</span>
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          {STAGES.map((s, i) => {
            const done = i < stageIdx;
            const current = i === stageIdx;
            const isDeliveredStep = s.key === "delivered" && current;
            return (
              <div key={s.key} className="flex items-center gap-3">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${isDeliveredStep ? "bg-success text-white" : done ? "bg-primary text-primary-foreground" : current ? "bg-primary/20 text-primary ring-2 ring-primary" : "bg-muted text-muted-foreground"}`}>
                  {done || isDeliveredStep ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span className={`text-sm ${isDeliveredStep ? "font-bold text-success" : current ? "font-bold text-foreground" : done ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {delivery && delivery.lat != null && delivery.lng != null && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><MapPin className="h-4 w-4 text-primary" /> Localização do entregador</p>
          <p className="text-xs text-muted-foreground">Última posição: {delivery.lat.toFixed(5)}, {delivery.lng.toFixed(5)}</p>
          <a target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${delivery.lat}&mlon=${delivery.lng}#map=17/${delivery.lat}/${delivery.lng}`} className="mt-2 inline-block text-xs font-semibold text-primary underline">Abrir no mapa</a>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Package className="h-4 w-4 text-primary" /> Itens</p>
        <ul className="space-y-1 text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between">
              <span>{i.quantidade}× {i.nome_snapshot}</span>
              <span>{fmt(i.preco_unit_cents * i.quantidade)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t border-border pt-2 text-sm">
          <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{fmt(order.subtotal_cents)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>{order.tipo_entrega === "pickup" ? "Retirada" : "Entrega"}</span><span>{order.tipo_entrega === "pickup" ? "Grátis" : order.frete_cents === 0 ? "Grátis" : fmt(order.frete_cents)}</span></div>
          {order.desconto_cents > 0 && <div className="flex justify-between text-primary"><span>Desconto</span><span>-{fmt(order.desconto_cents)}</span></div>}
          <div className="flex justify-between font-bold"><span>Total</span><span>{fmt(order.total_cents)}</span></div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Pagamento: {order.forma_pagamento}</p>
      </div>

      {CANCELABLE.has(order.status) && (
        <Button variant="outline" className="w-full" onClick={cancelar}>Cancelar pedido</Button>
      )}

      {order.status === "delivered" && !reviewed && (
        <ReviewForm
          orderId={order.id}
          clienteId={user.id}
          establishmentId={order.establishment_id}
          entregadorId={delivery?.entregador_id ?? null}
          onSubmitted={() => setReviewed(true)}
        />
      )}

      {order.status === "delivered" && reviewed && (
        <div className="rounded-2xl border border-success/40 bg-success/10 p-4 text-center text-sm font-semibold text-success">
          ✓ Avaliação enviada. Obrigado!
        </div>
      )}
    </div>
  );
}
