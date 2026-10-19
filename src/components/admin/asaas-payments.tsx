import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAsaasPayments, reconcileAsaasOrder } from "@/lib/admin-asaas.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { OrderPaymentBadge } from "@/components/order-payment-badge";
const issueLabel: Record<string, string> = {
  refund_required: "Reembolso necessário",
  duplicate_payment: "Pagamento duplicado · conferir reembolso",
  partially_refunded: "Reembolso parcial",
  disputed: "Contestação",
  reconciliation: "Conciliação manual necessária",
};
export function AsaasPayments() {
  const load = useServerFn(getAsaasPayments),
    reconcile = useServerFn(reconcileAsaasOrder);
  const [before, setBefore] = useState<string | undefined>();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["admin-asaas-payments", before],
    queryFn: () => load({ data: { before, limit: 50 } }),
    retry: false,
    refetchInterval: 30000,
  });
  return (
    <section className="min-w-0 space-y-4 rounded-2xl border bg-card p-4">
      <div>
        <h2 className="text-lg font-bold">Pagamentos online · Asaas</h2>
        <p className="text-sm text-muted-foreground">
          Pagamentos e pendências de todos os pedidos, inclusive cancelados antes da entrega.
          Confirmar pagamento não libera repasses automaticamente.
        </p>
      </div>
      {isPending ? (
        <p role="status">Carregando pagamentos…</p>
      ) : error ? (
        <div role="alert">
          <p>Não foi possível consultar os pagamentos.</p>
          <Button onClick={() => void refetch()}>Tentar novamente</Button>
        </div>
      ) : (
        <>
          <p className="text-sm font-semibold">Pendências abertas: {data?.unresolvedCount ?? 0}</p>
          {!data?.payments.length && (
            <p className="text-sm text-muted-foreground">Nenhum pagamento online nesta página.</p>
          )}
          <div className="space-y-3">
            {data?.payments.map((p) => (
              <article key={p.id} className="min-w-0 space-y-2 rounded-xl border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>
                    Pedido #{p.order_id.slice(0, 8)} ·{" "}
                    {(p.value_cents / 100).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </strong>
                  <OrderPaymentBadge channel="asaas" state={p.state} />
                </div>
                <p className="break-all text-xs text-muted-foreground">
                  {p.payment_id ?? "Cobrança ainda em criação"} · {p.environment} · {p.state}
                </p>
                <p className="break-all text-xs">Referência: {p.external_reference}</p>
                <p className="text-xs">
                  Líquido Asaas:{" "}
                  {p.net_value_cents === null
                    ? "a conferir"
                    : (p.net_value_cents / 100).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}{" "}
                  · Estornado:{" "}
                  {(p.refunded_value_cents / 100).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </p>
                {p.issues.map((i) => (
                  <p key={i.kind} className="font-medium text-amber-700 dark:text-amber-300">
                    {issueLabel[i.kind] ?? "Pendência de conferência"}
                  </p>
                ))}
                <Button
                  variant="outline"
                  disabled={busy !== null}
                  onClick={async () => {
                    if (busy) return;
                    setBusy(p.id);
                    try {
                      await reconcile({ data: { orderId: p.order_id } });
                      await refetch();
                      toast.success("Estado consultado na Asaas.");
                    } catch {
                      toast.error("Não foi possível conferir. A pendência continua registrada.");
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === p.id ? "Conferindo…" : "Conferir na Asaas"}
                </Button>
              </article>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {before && (
              <Button variant="outline" onClick={() => setBefore(undefined)}>
                Mais recentes
              </Button>
            )}
            {data?.payments.length === 50 && (
              <Button variant="outline" onClick={() => setBefore(data.payments.at(-1)!.created_at)}>
                Próxima página
              </Button>
            )}
            <Button variant="ghost" onClick={() => void refetch()}>
              Atualizar
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
