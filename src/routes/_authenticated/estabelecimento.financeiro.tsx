import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab, fmt } from "@/hooks/use-my-estab";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, DollarSign, TrendingUp, Percent, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/estabelecimento/financeiro")({
  component: FinanceiroPage,
});

type LedgerRow = {
  id: string; created_at: string; order_id: string;
  gross_cents: number; commission_cents: number; delivery_fee_cents: number;
  merchant_payout_cents: number; status: string;
};

function FinanceiroPage() {
  const { estab } = useMyEstab();
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [periodo, setPeriodo] = useState<"7d" | "30d" | "all">("30d");

  useEffect(() => {
    if (!estab) return;
    (async () => {
      let q = supabase.from("platform_ledger")
        .select("id,created_at,order_id,gross_cents,commission_cents,delivery_fee_cents,merchant_payout_cents,status")
        .eq("establishment_id", estab.id).order("created_at", { ascending: false });
      if (periodo !== "all") {
        const d = new Date(); d.setDate(d.getDate() - (periodo === "7d" ? 7 : 30));
        q = q.gte("created_at", d.toISOString());
      }
      const { data } = await q;
      setRows((data ?? []) as LedgerRow[]);
    })();
  }, [estab?.id, periodo]);

  const t = useMemo(() => {
    const bruto = rows.reduce((s, r) => s + r.gross_cents, 0);
    const comissao = rows.reduce((s, r) => s + r.commission_cents, 0);
    const repasse = rows.reduce((s, r) => s + r.merchant_payout_cents, 0);
    const pendente = rows.filter((r) => r.status === "pending").reduce((s, r) => s + r.merchant_payout_cents, 0);
    return { bruto, comissao, repasse, pendente };
  }, [rows]);

  function exportCSV() {
    const header = "Data,Pedido,Bruto,Comissao,Entrega,Repasse,Status\n";
    const body = rows.map((r) => [
      new Date(r.created_at).toLocaleString("pt-BR"),
      r.order_id.slice(0, 8),
      (r.gross_cents / 100).toFixed(2),
      (r.commission_cents / 100).toFixed(2),
      (r.delivery_fee_cents / 100).toFixed(2),
      (r.merchant_payout_cents / 100).toFixed(2),
      r.status,
    ].join(",")).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `financeiro-${periodo}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black tracking-tight">Financeiro</h1>
        <div className="flex gap-2">
          {(["7d", "30d", "all"] as const).map((p) => (
            <Button key={p} size="sm" variant={periodo === p ? "default" : "outline"} onClick={() => setPeriodo(p)}>
              {p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : "Todo período"}
            </Button>
          ))}
          <Button size="sm" variant="secondary" onClick={exportCSV}><Download className="mr-2 h-4 w-4" /> CSV</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { icon: DollarSign, label: "Valor bruto", value: fmt(t.bruto), color: "text-primary" },
          { icon: Percent, label: "Comissão plataforma", value: fmt(t.comissao), color: "text-amber-500" },
          { icon: TrendingUp, label: "Repasse total", value: fmt(t.repasse), color: "text-emerald-500" },
          { icon: Wallet, label: "Saldo pendente", value: fmt(t.pendente), color: "text-blue-500" },
        ].map((c) => (
          <Card key={c.label}><CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-xs text-muted-foreground">{c.label}<c.icon className={`h-4 w-4 ${c.color}`} /></CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-black">{c.value}</p></CardContent></Card>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-left"><tr>
            <th className="p-3">Data</th><th className="p-3">Pedido</th><th className="p-3">Bruto</th>
            <th className="p-3">Comissão</th><th className="p-3">Repasse</th><th className="p-3">Status</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="p-3">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                <td className="p-3 font-mono text-xs">{r.order_id.slice(0, 8)}</td>
                <td className="p-3">{fmt(r.gross_cents)}</td>
                <td className="p-3 text-amber-600">-{fmt(r.commission_cents)}</td>
                <td className="p-3 font-semibold text-emerald-600">{fmt(r.merchant_payout_cents)}</td>
                <td className="p-3"><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{r.status}</span></td>
              </tr>
            ))}
            {rows.length === 0 && (<tr><td className="p-6 text-center text-muted-foreground" colSpan={6}>Sem movimentações no período.</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
