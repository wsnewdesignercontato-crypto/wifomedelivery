import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Wallet, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useMyCourier, fmt } from "@/hooks/use-courier";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/entregador/carteira")({
  component: Carteira,
});

type Ledger = { id: string; courier_payout_cents: number; status: string; created_at: string };
type Withdrawal = {
  id: string;
  valor_cents: number;
  metodo: string;
  status: string;
  created_at: string;
};

function Carteira() {
  const { courier } = useMyCourier();
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [valor, setValor] = useState("");
  const [open, setOpen] = useState(false);

  const disponivel =
    ledger.filter((l) => l.status === "paid").reduce((s, l) => s + l.courier_payout_cents, 0) -
    withdrawals
      .filter((w) => w.status === "pago" || w.status === "aprovado")
      .reduce((s, w) => s + w.valor_cents, 0);
  const pendente = ledger
    .filter((l) => l.status === "pending")
    .reduce((s, l) => s + l.courier_payout_cents, 0);
  const total = ledger.reduce((s, l) => s + l.courier_payout_cents, 0);

  async function load() {
    if (!courier) return;
    const { data: l } = await supabase
      .from("platform_ledger")
      .select("id,courier_payout_cents,status,created_at")
      .eq("courier_id", courier.user_id)
      .order("created_at", { ascending: false })
      .limit(100);
    setLedger((l ?? []) as Ledger[]);
    const { data: w } = await supabase
      .from("courier_withdrawals")
      .select("id,valor_cents,metodo,status,created_at")
      .eq("courier_id", courier.user_id)
      .order("created_at", { ascending: false })
      .limit(50);
    setWithdrawals((w ?? []) as Withdrawal[]);
  }

  useEffect(() => {
    load();
  }, [courier]);

  async function solicitar() {
    if (!courier) return;
    const cents = Math.round(Number(valor.replace(",", ".")) * 100);
    if (!cents || cents < 500) return toast.error("Valor mínimo R$ 5,00");
    if (cents > disponivel) return toast.error("Valor acima do saldo disponível");
    const { error } = await supabase.from("courier_withdrawals").insert({
      courier_id: courier.user_id,
      valor_cents: cents,
      metodo: "pix",
      pix_key: courier.pix_key,
      liquido_cents: cents,
    });
    if (error) return toast.error(error.message);
    toast.success("Saque solicitado!");
    setValor("");
    setOpen(false);
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">Carteira</h1>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-primary bg-gradient-brand p-6 text-primary-foreground shadow-brand">
          <div className="flex items-center gap-2 text-sm opacity-90">
            <Wallet className="h-4 w-4" /> Disponível
          </div>
          <p className="mt-2 text-3xl font-black">{fmt(disponivel)}</p>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                className="mt-3 bg-white text-primary hover:bg-white/90"
                size="sm"
                disabled={disponivel < 500}
              >
                <ArrowUpRight className="mr-2 h-4 w-4" /> Solicitar saque
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Solicitar saque PIX</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Valor</Label>
                  <Input
                    placeholder="0,00"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Chave PIX: {courier?.pix_key ?? "cadastre no perfil"}
                </p>
                <Button className="w-full" onClick={solicitar}>
                  Confirmar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <p className="text-sm text-muted-foreground">Pendente</p>
          <p className="mt-2 text-2xl font-black">{fmt(pendente)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <p className="text-sm text-muted-foreground">Total recebido</p>
          <p className="mt-2 text-2xl font-black">{fmt(total)}</p>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Saques</h2>
        {withdrawals.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Nenhum saque solicitado.
          </p>
        ) : (
          <div className="space-y-2">
            {withdrawals.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-card"
              >
                <div>
                  <p className="font-semibold">{fmt(w.valor_cents)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(w.created_at).toLocaleString("pt-BR")} · {w.metodo.toUpperCase()}
                  </p>
                </div>
                <Badge variant={w.status === "pago" ? "default" : "secondary"}>{w.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Extrato</h2>
        {ledger.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Sem lançamentos.
          </p>
        ) : (
          <div className="space-y-2">
            {ledger.slice(0, 20).map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between rounded-2xl border border-border bg-card p-3 shadow-card"
              >
                <div>
                  <p className="text-sm font-semibold">Corrida</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(l.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-primary">{fmt(l.courier_payout_cents)}</p>
                  <Badge variant="outline" className="mt-1 text-[10px]">
                    {l.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
