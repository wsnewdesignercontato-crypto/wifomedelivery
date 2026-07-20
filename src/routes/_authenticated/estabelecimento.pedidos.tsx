import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab, fmt } from "@/hooks/use-my-estab";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OrderHistory } from "@/components/order-history";
import { Bike, ReceiptText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/estabelecimento/pedidos")({
  component: PedidosPage,
});

type Order = {
  id: string; cliente_id: string; status: string; total_cents: number;
  observacoes: string | null; created_at: string;
  endereco_entrega: { endereco?: string } | null;
  tipo_entrega: "delivery" | "pickup" | null;
  cancellation_reason?: string | null; cancelled_role?: string | null;
  refund_status?: string | null; refund_amount_cents?: number | null;
};
type OrderItem = { id: string; order_id: string; nome_snapshot: string; quantidade: number; preco_unit_cents: number };

const STATUS_LABEL: Record<string, string> = {
  placed: "Novo", accepted: "Aceito", preparing: "Em preparo", ready: "Pronto",
  waiting_courier: "Aguardando entregador", courier_assigned: "Entregador a caminho",
  picked_up: "Coletado", on_the_way: "A caminho", arriving: "Chegando",
  delivered: "Entregue", cancelled: "Cancelado", refunded: "Reembolsado",
};
const TERMINAL = new Set(["delivered", "cancelled", "refunded"]);

function PedidosPage() {
  const { estab } = useMyEstab();
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [openHistory, setOpenHistory] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>("todos");

  async function reload() {
    if (!estab) return;
    const { data } = await supabase
      .from("orders")
      .select("id,cliente_id,status,total_cents,observacoes,created_at,endereco_entrega,tipo_entrega,cancellation_reason,cancelled_role,refund_status,refund_amount_cents")
      .eq("establishment_id", estab.id)
      .order("created_at", { ascending: false })
      .limit(80);
    const list = (data ?? []) as Order[];
    setOrders(list);
    if (list.length) {
      const ids = list.map((o) => o.id);
      const { data: it } = await supabase.from("order_items").select("*").in("order_id", ids);
      const g: Record<string, OrderItem[]> = {};
      (it ?? []).forEach((r) => { (g[r.order_id] ??= []).push(r as OrderItem); });
      setItems(g);
    }
  }

  useEffect(() => {
    if (!estab) return;
    reload();
    const ch = supabase
      .channel("estab-pedidos-" + estab.id)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `establishment_id=eq.${estab.id}` },
        () => { reload(); toast.info("Pedido atualizado"); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [estab?.id]);

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
      <div>
        <h1 className="text-2xl font-black tracking-tight">Central de pedidos</h1>
        <p className="text-sm text-muted-foreground">Atualização em tempo real.</p>
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
            return (
              <div key={o.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-primary/15 text-primary hover:bg-primary/20">{STATUS_LABEL[o.status] ?? o.status}</Badge>
                      <Badge variant="outline" className={o.tipo_entrega === "pickup" ? "border-amber-500/50 text-amber-600" : "border-primary/40 text-primary"}>
                        {o.tipo_entrega === "pickup" ? "🏪 Retirada" : "🛵 Entrega"}
                      </Badge>
                      {o.refund_status === "completed" && (<Badge variant="secondary">Reembolso {fmt(o.refund_amount_cents ?? 0)}</Badge>)}
                      <span className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleTimeString("pt-BR")}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {o.tipo_entrega === "pickup" ? "Cliente retira no local" : `Entregar em: ${o.endereco_entrega?.endereco ?? "—"}`}
                    </p>
                  </div>
                  <span className="font-bold text-primary">{fmt(o.total_cents)}</span>
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {(items[o.id] ?? []).map((it) => (
                    <li key={it.id} className="flex justify-between">
                      <span>{it.quantidade}× {it.nome_snapshot}</span>
                      <span className="text-muted-foreground">{fmt(it.preco_unit_cents * it.quantidade)}</span>
                    </li>
                  ))}
                </ul>
                {o.observacoes && (<p className="mt-2 rounded-lg bg-muted p-2 text-xs">Obs: {o.observacoes}</p>)}
                {o.status === "cancelled" && o.cancellation_reason && (
                  <p className="mt-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                    Cancelado{o.cancelled_role ? ` (${o.cancelled_role})` : ""}: {o.cancellation_reason}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {step && (<Button size="sm" onClick={() => mudarStatus(o.id, step.next)}>{step.next === "ready" && <Bike className="mr-2 h-4 w-4" />}{step.label}</Button>)}
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
