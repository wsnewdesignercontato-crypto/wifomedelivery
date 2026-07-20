import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Clock, XCircle, RefreshCw, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type HistoryRow = {
  id: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  created_at: string;
};

type OrderMeta = {
  status: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  cancelled_role: string | null;
  refund_status: string | null;
  refund_amount_cents: number | null;
  refunded_at: string | null;
  total_cents: number;
};

const STATUS_LABEL: Record<string, string> = {
  placed: "Pedido recebido",
  accepted: "Aceito pela loja",
  preparing: "Em preparo",
  ready: "Pronto",
  waiting_courier: "Aguardando entregador",
  courier_assigned: "Entregador designado",
  picked_up: "Coletado",
  on_the_way: "A caminho",
  arriving: "Chegando",
  delivered: "Entregue",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

const REFUND_LABEL: Record<string, string> = {
  none: "Sem reembolso",
  pending: "Reembolso pendente",
  processing: "Processando reembolso",
  completed: "Reembolso concluído",
  failed: "Falha no reembolso",
};

function formatCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function OrderHistory({ orderId }: { orderId: string }) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [order, setOrder] = useState<OrderMeta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const [hist, ord] = await Promise.all([
        supabase
          .from("order_status_history")
          .select("id, from_status, to_status, reason, created_at")
          .eq("order_id", orderId)
          .order("created_at", { ascending: true }),
        supabase
          .from("orders")
          .select(
            "status, cancelled_at, cancellation_reason, cancelled_role, refund_status, refund_amount_cents, refunded_at, total_cents",
          )
          .eq("id", orderId)
          .maybeSingle(),
      ]);
      if (!active) return;
      setRows((hist.data ?? []) as HistoryRow[]);
      setOrder((ord.data ?? null) as OrderMeta | null);
      setLoading(false);
    };

    load();

    const ch = supabase
      .channel(`order-history-${orderId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_status_history", filter: `order_id=eq.${orderId}` },
        (payload) => setRows((prev) => [...prev, payload.new as HistoryRow]),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        (payload) => setOrder((prev) => ({ ...(prev ?? {}), ...(payload.new as OrderMeta) })),
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [orderId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando histórico…
      </div>
    );
  }

  const isCancelled = order?.status === "cancelled" || order?.status === "refunded";

  return (
    <div className="space-y-4">
      {isCancelled && order && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 text-destructive">
            <XCircle className="h-4 w-4" />
            <p className="font-semibold">Pedido cancelado</p>
          </div>
          {order.cancelled_at && (
            <p className="mt-1 text-xs text-muted-foreground">Em {formatDate(order.cancelled_at)}</p>
          )}
          {order.cancellation_reason && (
            <p className="mt-2 text-sm text-foreground">
              <span className="font-medium">Motivo:</span> {order.cancellation_reason}
            </p>
          )}
          {order.cancelled_role && (
            <p className="mt-1 text-xs text-muted-foreground">Cancelado por: {order.cancelled_role}</p>
          )}
        </div>
      )}

      {order && order.refund_status && order.refund_status !== "none" && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-primary">
            {order.refund_status === "completed" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <RefreshCw className={`h-4 w-4 ${order.refund_status === "processing" ? "animate-spin" : ""}`} />
            )}
            <p className="font-semibold">{REFUND_LABEL[order.refund_status] ?? order.refund_status}</p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">
              Valor: {formatCents(order.refund_amount_cents ?? 0)} de {formatCents(order.total_cents)}
            </Badge>
            {order.refunded_at && (
              <span className="text-xs text-muted-foreground">Concluído em {formatDate(order.refunded_at)}</span>
            )}
          </div>
        </div>
      )}

      <div>
        <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Clock className="h-4 w-4" /> Linha do tempo
        </h4>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma mudança registrada ainda.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-border pl-5">
            {rows.map((r) => (
              <li key={r.id} className="relative">
                <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
                <p className="text-sm font-medium text-foreground">
                  {STATUS_LABEL[r.to_status] ?? r.to_status}
                  {r.from_status && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      (de {STATUS_LABEL[r.from_status] ?? r.from_status})
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{formatDate(r.created_at)}</p>
                {r.reason && (
                  <p className="mt-1 rounded-md bg-muted px-2 py-1 text-xs text-foreground">Motivo: {r.reason}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
