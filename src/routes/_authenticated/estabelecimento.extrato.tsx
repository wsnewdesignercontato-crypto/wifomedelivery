import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Filter, Percent, Wallet, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMyEstab } from "@/hooks/use-my-estab";

export const Route = createFileRoute("/_authenticated/estabelecimento/extrato")({
  component: Extrato,
});

const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Ledger = {
  id: string;
  order_id: string | null;
  merchant_payout_cents: number;
  commission_cents: number;
  gross_cents: number;
  status: string;
  created_at: string;
};
type Withdrawal = {
  id: string;
  valor_cents: number;
  status: string;
  metodo: string;
  processado_em: string | null;
  created_at: string;
};

type Entry = {
  id: string;
  date: string;
  kind: "deposito" | "taxa" | "saque";
  label: string;
  detail: string;
  status: string;
  amount: number; // positive = in, negative = out
};

type Preset = "7" | "30" | "90" | "month" | "custom";

function startOf(preset: Preset, from: string, to: string): { start: Date; end: Date } {
  const end = preset === "custom" && to ? new Date(`${to}T23:59:59`) : new Date();
  const start = new Date(end);
  if (preset === "custom" && from) return { start: new Date(`${from}T00:00:00`), end };
  if (preset === "month") { start.setDate(1); start.setHours(0, 0, 0, 0); return { start, end }; }
  const days = Number(preset);
  start.setDate(end.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function Extrato() {
  const { estab } = useMyEstab();
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<Preset>("30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tipo, setTipo] = useState<"all" | "deposito" | "taxa" | "saque">("all");

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!estab) return;
      setLoading(true);
      const [{ data: l }, { data: w }] = await Promise.all([
        supabase.from("platform_ledger")
          .select("id,order_id,merchant_payout_cents,commission_cents,gross_cents,status,created_at")
          .eq("establishment_id", estab.id)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("establishment_withdrawals")
          .select("id,valor_cents,status,metodo,processado_em,created_at")
          .eq("establishment_id", estab.id)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      if (!mounted) return;
      setLedger((l ?? []) as Ledger[]);
      setWithdrawals((w ?? []) as Withdrawal[]);
      setLoading(false);
    }
    load();
    return () => { mounted = false; };
  }, [estab?.id]);

  const { start, end } = useMemo(() => startOf(preset, from, to), [preset, from, to]);

  const entries: Entry[] = useMemo(() => {
    const arr: Entry[] = [];
    for (const l of ledger) {
      const d = new Date(l.created_at);
      if (d < start || d > end) continue;
      arr.push({
        id: `dep-${l.id}`,
        date: l.created_at,
        kind: "deposito",
        label: "Venda recebida",
        detail: `Pedido #${l.order_id?.slice(0, 8) ?? "—"} · Bruto ${fmt(l.gross_cents)}`,
        status: l.status,
        amount: l.merchant_payout_cents,
      });
      if (l.commission_cents > 0) {
        arr.push({
          id: `tax-${l.id}`,
          date: l.created_at,
          kind: "taxa",
          label: "Taxa da plataforma",
          detail: `Pedido #${l.order_id?.slice(0, 8) ?? "—"} · Comissão`,
          status: l.status,
          amount: -l.commission_cents,
        });
      }
    }
    for (const w of withdrawals) {
      if (w.status === "recusado" || w.status === "cancelado") continue;
      const dateStr = w.processado_em ?? w.created_at;
      const d = new Date(dateStr);
      if (d < start || d > end) continue;
      arr.push({
        id: `saq-${w.id}`,
        date: dateStr,
        kind: "saque",
        label: w.status === "pago" ? "Saque pago" : "Saque solicitado",
        detail: `Método ${w.metodo.toUpperCase()} · #${w.id.slice(0, 8)}`,
        status: w.status,
        amount: -w.valor_cents,
      });
    }
    arr.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return arr;
  }, [ledger, withdrawals, start, end]);

  const filtered = tipo === "all" ? entries : entries.filter((e) => e.kind === tipo);

  const totals = useMemo(() => {
    let depositos = 0, taxas = 0, saques = 0;
    for (const e of entries) {
      if (e.kind === "deposito") depositos += e.amount;
      else if (e.kind === "taxa") taxas += e.amount;
      else if (e.kind === "saque") saques += e.amount;
    }
    return { depositos, taxas, saques, saldo: depositos + taxas + saques };
  }, [entries]);

  function exportCsv() {
    const header = ["Data", "Tipo", "Descrição", "Status", "Valor (BRL)"];
    const rows = filtered.map((e) => [
      new Date(e.date).toLocaleString("pt-BR"),
      e.kind,
      `${e.label} — ${e.detail}`.replace(/;/g, ","),
      e.status,
      (e.amount / 100).toFixed(2).replace(".", ","),
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `extrato-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Extrato financeiro</h1>
          <p className="text-sm text-muted-foreground">
            Entradas e saídas da sua carteira: vendas, taxas e saques.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
          <Receipt className="mr-2 h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Filter className="h-4 w-4" /> Filtros
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <Label className="text-xs">Período</Label>
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="month">Este mês</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="deposito">Entradas (vendas)</SelectItem>
                <SelectItem value="taxa">Taxas</SelectItem>
                <SelectItem value="saque">Saques</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" disabled={preset !== "custom"} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" disabled={preset !== "custom"} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Totais */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard icon={<ArrowDownRight className="h-4 w-4" />} tone="in" label="Entradas" value={fmt(totals.depositos)} />
        <SummaryCard icon={<Percent className="h-4 w-4" />} tone="out" label="Taxas" value={fmt(totals.taxas)} />
        <SummaryCard icon={<ArrowUpRight className="h-4 w-4" />} tone="out" label="Saques" value={fmt(totals.saques)} />
        <SummaryCard icon={<Wallet className="h-4 w-4" />} tone="net" label="Saldo do período" value={fmt(totals.saldo)} />
      </div>

      {/* Lançamentos */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Lançamentos ({filtered.length})
        </h2>
        {loading ? (
          <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Carregando...
          </p>
        ) : filtered.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Nenhum lançamento no período selecionado.
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((e) => {
              const positive = e.amount >= 0;
              return (
                <li key={e.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${positive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                      {positive ? <ArrowDownRight className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{e.label}</p>
                      <p className="truncate text-xs text-muted-foreground">{e.detail}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(e.date).toLocaleString("pt-BR")}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-black ${positive ? "text-emerald-600" : "text-rose-600"}`}>
                      {positive ? "+" : "−"} {fmt(Math.abs(e.amount))}
                    </p>
                    <Badge variant="outline" className="mt-1 text-[10px] uppercase">{e.status}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "in" | "out" | "net" }) {
  const isZero = /^R\$\s*0,00$/.test(value);
  const cls = isZero
    ? "text-foreground"
    : tone === "in"
      ? "text-emerald-600"
      : tone === "out"
        ? "text-rose-600"
        : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <p className={`mt-2 text-xl font-black ${cls}`}>{value}</p>
    </div>
  );
}
