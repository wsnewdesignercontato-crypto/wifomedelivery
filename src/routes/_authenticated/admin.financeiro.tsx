import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { KpiCard } from "@/components/admin/kpi-card";
import { fmtBRL } from "@/lib/format";
import { DollarSign, TrendingUp, Wallet, Percent, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { sumLedgerAmounts } from "@/lib/commerce";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AsaasPayments } from "@/components/admin/asaas-payments";
import { isConfirmedSale, summarizeAdminSales } from "@/lib/admin-sales";
import { summarizeCommissions } from "@/lib/admin-commissions";
import { getAdminCommissionOrders } from "@/lib/admin-commissions.functions";
import { CommissionSales } from "@/components/admin/commission-sales";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/financeiro")({
  head: () => ({
    meta: [
      { title: "Admin — Financeiro | PedeTrem" },
      { name: "description", content: "PedeTrem: admin, financeiro." },
      { property: "og:title", content: "Admin — Financeiro | PedeTrem" },
      { property: "og:description", content: "PedeTrem: admin, financeiro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinanceiroPage,
});

type Row = {
  id: string;
  order_id: string | null;
  establishment_id: string | null;
  gross_cents: number;
  commission_cents: number;
  courier_commission_cents: number;
  delivery_fee_cents: number;
  courier_payout_cents: number;
  merchant_payout_cents: number;
  platform_revenue_cents: number;
  status: string;
  created_at: string;
};

async function fetchLedger() {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("platform_ledger")
      .select(
        "id,order_id,establishment_id,gross_cents,commission_cents,courier_commission_cents,delivery_fee_cents,courier_payout_cents,merchant_payout_cents,platform_revenue_cents,status,created_at",
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

function toCSV(rows: Row[]) {
  const header = [
    "created_at",
    "order_id",
    "establishment_id",
    "gross_cents",
    "commission_cents",
    "courier_commission_cents",
    "courier_payout_cents",
    "merchant_payout_cents",
    "platform_revenue_cents",
    "status",
  ];
  const body = rows.map((r) =>
    header.map((k) => (r as Record<string, unknown>)[k] ?? "").join(","),
  );
  return [header.join(","), ...body].join("\n");
}

function FinanceiroPage() {
  const loadCommissions = useServerFn(getAdminCommissionOrders);
  const {
    data = [],
    isLoading,
    error,
    refetch,
  } = useQuery({ queryKey: ["ledger"], queryFn: fetchLedger, refetchInterval: 30000 });
  const salesQuery = useQuery({
    queryKey: ["admin-commission-orders"],
    queryFn: () => loadCommissions(),
    refetchInterval: 30000,
  });
  const refetchSales = salesQuery.refetch;
  useEffect(() => {
    const channel = supabase
      .channel("admin-finance-sales")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        void refetch();
        void refetchSales();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refetch, refetchSales]);
  const [range, setRange] = useState<"7" | "30" | "all">("30");
  const [settlement, setSettlement] = useState<Row | null>(null);
  const [settlementMode, setSettlementMode] = useState<"receipt" | "refund">("receipt");
  const [reference, setReference] = useState("");
  const [settling, setSettling] = useState(false);

  async function confirmReceipt() {
    if (!settlement?.order_id || settling) return;
    if (reference.trim().length < 3)
      return toast.error("Informe a referência do comprovante conferido");
    setSettling(true);
    try {
      const { error: receiptError } = await supabase.rpc(
        settlementMode === "refund" ? "record_order_refund" : "settle_order_payment",
        {
          p_order_id: settlement.order_id,
          p_reference: reference.trim(),
        },
      );
      if (receiptError) throw new Error(receiptError.message);
      toast.success(
        settlementMode === "refund"
          ? "Reembolso integral registrado; lançamentos estornados"
          : "Recebimento confirmado; saldo liberado nas carteiras",
      );
      setSettlement(null);
      setReference("");
      await refetch();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Falha ao confirmar recebimento");
    } finally {
      setSettling(false);
    }
  }

  const filtered = useMemo(() => {
    if (range === "all") return data;
    const days = Number(range);
    const min = Date.now() - days * 86400000;
    return data.filter((r) => new Date(r.created_at).getTime() >= min);
  }, [data, range]);

  const totals = sumLedgerAmounts(filtered);
  const periodSales = (salesQuery.data ?? []).filter(
    (order) =>
      range === "all" ||
      new Date(order.created_at).getTime() >= Date.now() - Number(range) * 86400000,
  );
  const sales = summarizeAdminSales(periodSales);
  const commissions = summarizeCommissions(periodSales);
  const takeRate = totals.gross > 0 ? (totals.revenue / totals.gross) * 100 : 0;

  function download() {
    const blob = new Blob([toCSV(filtered)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wifome-financeiro-${range}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            Faturamento bruto, comissões, repasses e take-rate.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["7", "30", "all"] as const).map((r) => (
            <Button
              key={r}
              variant={range === r ? "default" : "outline"}
              size="sm"
              onClick={() => setRange(r)}
            >
              {r === "all" ? "Tudo" : `${r} dias`}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={download}>
            <Download className="mr-1 h-4 w-4" />
            CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Vendas confirmadas (bruto)"
          value={salesQuery.isError ? "—" : fmtBRL(sales.gross)}
          icon={DollarSign}
          loading={salesQuery.isPending}
          hint="Pagamento online confirmado ou entrega concluída"
        />
        <KpiCard
          label="Comissão da plataforma"
          value={salesQuery.isError || commissions.unknown > 0 ? "—" : fmtBRL(commissions.platform)}
          icon={TrendingUp}
          tone="primary"
          loading={salesQuery.isPending}
          hint={
            commissions.unknown > 0
              ? "Há pedidos em conferência"
              : `Produtos: ${fmtBRL(commissions.products)} · Frete: ${fmtBRL(commissions.freight)}. Previsto até a entrega.`
          }
        />
        <KpiCard
          label="Repasse lojas"
          value={error ? "—" : fmtBRL(totals.merchant)}
          icon={Wallet}
          loading={isLoading}
          hint="Entregas concluídas; saldo depende da conferência"
        />
        <KpiCard
          label="Take-rate das entregas"
          value={error ? "—" : `${takeRate.toFixed(1)}%`}
          icon={Percent}
          loading={isLoading}
        />
      </div>
      {salesQuery.error ? (
        <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm">
          Não foi possível consultar as vendas.{" "}
          <Button variant="outline" size="sm" onClick={() => void refetchSales()}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        !salesQuery.isPending && (
          <p className="text-sm text-muted-foreground">
            {sales.count} vendas confirmadas no período. {fmtBRL(sales.awaitingDelivery)} em
            pagamentos online aguardando entrega. Os repasses abaixo são gerados na conclusão da
            entrega e continuam sujeitos à conferência do recebimento.
          </p>
        )
      )}
      {!salesQuery.isPending && !salesQuery.isError && (
        <CommissionSales orders={periodSales.filter(isConfirmedSale)} />
      )}
      <p className="text-sm text-muted-foreground">
        Receita da plataforma em entregas concluídas:{" "}
        {error ? "indisponível" : fmtBRL(totals.revenue)}. Esse valor é separado das comissões
        previstas.
      </p>
      <AsaasPayments />
      {error && (
        <p className="text-sm text-destructive">Falha ao carregar financeiro: {error.message}</p>
      )}
      <p className="text-sm text-muted-foreground">
        Confirme o recebimento somente após conferir o pagamento. A confirmação libera o saldo para
        saque e registra a referência; nenhuma transferência bancária é executada por esta ação.
      </p>

      <Dialog
        open={settlement !== null}
        onOpenChange={(open) => {
          if (!open && !settling) setSettlement(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {settlementMode === "refund"
                ? "Registrar reembolso integral"
                : "Confirmar pagamento recebido"}
            </DialogTitle>
            <DialogDescription>
              Pedido {settlement?.order_id?.slice(0, 8)} · {fmtBRL(settlement?.gross_cents ?? 0)}.
              {settlementMode === "refund"
                ? "Registre somente após realizar e conferir a devolução integral; não envia dinheiro. O saldo correspondente será estornado nas carteiras."
                : "Confirme após verificar o recebimento integral. Os repasses ficarão disponíveis nas carteiras."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="payment-reference">Referência ou comprovante conferido</Label>
            <Input
              id="payment-reference"
              value={reference}
              maxLength={160}
              onChange={(event) => setReference(event.target.value)}
              placeholder={
                settlementMode === "refund"
                  ? "Identificação da devolução integral"
                  : "Identificação do recebimento"
              }
            />
          </div>
          <Button onClick={confirmReceipt} disabled={settling || reference.trim().length < 3}>
            {settling
              ? "Registrando…"
              : settlementMode === "refund"
                ? "Registrar devolução integral conferida"
                : "Confirmar recebimento e liberar saldo"}
          </Button>
        </DialogContent>
      </Dialog>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4 text-sm font-semibold">
          Últimos lançamentos ({filtered.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr className="[&>th]:px-4 [&>th]:py-2 [&>th]:text-left">
                <th>Data</th>
                <th>Pedido</th>
                <th>Bruto</th>
                <th>Comissão dos produtos</th>
                <th>Taxa do frete</th>
                <th>Loja</th>
                <th>Entregador</th>
                <th>Status</th>
                <th>Recebimento</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-muted-foreground">
                    Carregando…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-muted-foreground">
                    Sem lançamentos no período.
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-4 py-2 text-xs">
                    {new Date(r.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{r.order_id?.slice(0, 8)}</td>
                  <td className="px-4 py-2">{fmtBRL(r.gross_cents)}</td>
                  <td className="px-4 py-2 text-emerald-600">{fmtBRL(r.commission_cents)}</td>
                  <td className="px-4 py-2 text-emerald-600">
                    {fmtBRL(r.courier_commission_cents)}
                  </td>
                  <td className="px-4 py-2">{fmtBRL(r.merchant_payout_cents)}</td>
                  <td className="px-4 py-2">{fmtBRL(r.courier_payout_cents)}</td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600">
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {r.status === "pending" && r.order_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={settling}
                        onClick={() => {
                          setReference("");
                          setSettlementMode("receipt");
                          setSettlement(r);
                        }}
                      >
                        Confirmar recebido
                      </Button>
                    )}
                    {r.status === "paid" && (
                      <span className="text-xs text-muted-foreground">Confirmado</span>
                    )}
                    {(r.status === "paid" || r.status === "pending") && r.order_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-2"
                        disabled={settling}
                        onClick={() => {
                          setReference("");
                          setSettlementMode("refund");
                          setSettlement(r);
                        }}
                      >
                        Registrar reembolso integral
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
