import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { KpiCard } from "@/components/admin/kpi-card";
import { fmtBRL } from "@/lib/format";
import { DollarSign, TrendingUp, Wallet, Percent, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/admin/financeiro")({
  component: FinanceiroPage,
});

type Row = {
  id: string;
  order_id: string | null;
  establishment_id: string | null;
  gross_cents: number;
  commission_cents: number;
  delivery_fee_cents: number;
  courier_payout_cents: number;
  merchant_payout_cents: number;
  platform_revenue_cents: number;
  status: string;
  created_at: string;
};

async function fetchLedger() {
  const { data, error } = await supabase
    .from("platform_ledger")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as Row[];
}

function toCSV(rows: Row[]) {
  const header = [
    "created_at",
    "order_id",
    "establishment_id",
    "gross_cents",
    "commission_cents",
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
  const { data = [], isLoading } = useQuery({ queryKey: ["ledger"], queryFn: fetchLedger });
  const [range, setRange] = useState<"7" | "30" | "all">("30");

  const filtered = useMemo(() => {
    if (range === "all") return data;
    const days = Number(range);
    const min = Date.now() - days * 86400000;
    return data.filter((r) => new Date(r.created_at).getTime() >= min);
  }, [data, range]);

  const totals = filtered.reduce(
    (acc, r) => ({
      gross: acc.gross + r.gross_cents,
      revenue: acc.revenue + r.platform_revenue_cents,
      merchant: acc.merchant + r.merchant_payout_cents,
      courier: acc.courier + r.courier_payout_cents,
    }),
    { gross: 0, revenue: 0, merchant: 0, courier: 0 },
  );
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
        <KpiCard label="GMV (bruto)" value={fmtBRL(totals.gross)} icon={DollarSign} />
        <KpiCard
          label="Receita plataforma"
          value={fmtBRL(totals.revenue)}
          icon={TrendingUp}
          tone="primary"
        />
        <KpiCard label="Repasse lojas" value={fmtBRL(totals.merchant)} icon={Wallet} />
        <KpiCard label="Take-rate" value={`${takeRate.toFixed(1)}%`} icon={Percent} />
      </div>

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
                <th>Comissão</th>
                <th>Loja</th>
                <th>Entregador</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    Carregando…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
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
                  <td className="px-4 py-2 text-emerald-600">{fmtBRL(r.platform_revenue_cents)}</td>
                  <td className="px-4 py-2">{fmtBRL(r.merchant_payout_cents)}</td>
                  <td className="px-4 py-2">{fmtBRL(r.courier_payout_cents)}</td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600">
                      {r.status}
                    </span>
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
