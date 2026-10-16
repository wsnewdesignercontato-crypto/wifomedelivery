import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  pendingAttempt,
  browserAttemptStorage,
  completeAttempt,
  type PendingAttempt,
} from "@/lib/pending-attempt";
import { toast } from "sonner";
import { Wallet, ArrowUpRight, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useMyEstab, fmt } from "@/hooks/use-my-estab";
import {
  emptyWallet,
  parseMoneyCents,
  walletSummarySchema,
  type WalletSummary,
} from "@/lib/commerce";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/estabelecimento/carteira")({
  head: () => ({
    meta: [
      { title: "Loja — Carteira | PedeTrem" },
      { name: "description", content: "PedeTrem: loja, carteira." },
      { property: "og:title", content: "Loja — Carteira | PedeTrem" },
      { property: "og:description", content: "PedeTrem: loja, carteira." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Carteira,
});

type Withdrawal = {
  id: string;
  valor_cents: number;
  metodo: string;
  status: string;
  created_at: string;
  motivo_recusa: string | null;
};

function Carteira() {
  const { estab } = useMyEstab();
  const estabId = estab?.id;
  const [summary, setSummary] = useState<WalletSummary>(emptyWallet);
  const [walletReady, setWalletReady] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [valor, setValor] = useState("");
  const [open, setOpen] = useState(false);
  const attemptRef = useRef<PendingAttempt | null>(null);
  const [kyc, setKyc] = useState<string>("pendente");

  const disponivel = summary.available_cents;
  const pendente = summary.pending_cents;
  const total = summary.total_cents;

  const load = useCallback(async () => {
    if (!estabId) return;
    setWalletReady(false);
    const [account, balance, history] = await Promise.all([
      supabase.from("establishments").select("kyc_status").eq("id", estabId).maybeSingle(),
      supabase.rpc("wallet_summary", { p_kind: "merchant", p_establishment_id: estabId }),
      supabase
        .from("establishment_withdrawals")
        .select("id,valor_cents,metodo,status,created_at,motivo_recusa")
        .eq("establishment_id", estabId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    const parsed = walletSummarySchema.safeParse(balance.data);
    if (account.error || balance.error || history.error || !parsed.success) {
      setSummary(emptyWallet);
      toast.error(
        account.error?.message ??
          balance.error?.message ??
          history.error?.message ??
          "Falha ao consultar saldo",
      );
      return;
    }
    setKyc(account.data?.kyc_status ?? "pendente");
    setSummary(parsed.data);
    setWithdrawals((history.data ?? []) as Withdrawal[]);
    setWalletReady(true);
  }, [estabId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function solicitar() {
    if (!estab || !walletReady || requesting) return;
    if (kyc !== "aprovado")
      return toast.error("Conta não validada. Envie os documentos para aprovação.");
    if (!estab.pix_key) return toast.error("Cadastre a chave PIX nas configurações");
    if (!estab.banco_titular) return toast.error("Cadastre o titular da conta");
    const cents = parseMoneyCents(valor);
    if (cents === null || cents < 500)
      return toast.error("Informe um valor válido, mínimo R$ 5,00");
    if (cents > disponivel) return toast.error("Valor acima do saldo disponível");
    setRequesting(true);
    const storageKey = `wifome-pending-withdrawal-merchant-${estab.id}`;
    attemptRef.current = pendingAttempt(
      browserAttemptStorage(),
      storageKey,
      String(cents),
      attemptRef.current,
    );
    try {
      const { error } = await supabase.rpc("request_withdrawal", {
        p_kind: "merchant",
        p_establishment_id: estab.id,
        p_valor_cents: cents,
        p_idempotency_key: attemptRef.current.key,
      });
      if (error) throw new Error(error.message);
      completeAttempt(storageKey);
      attemptRef.current = null;
      toast.success("Saque solicitado! Aguardando aprovação.");
      setValor("");
      setOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao solicitar saque");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">Carteira / Caixa</h1>

      {kyc !== "aprovado" && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm flex gap-3">
          <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <p className="font-bold text-amber-900 dark:text-amber-200">Conta {kyc}</p>
            <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
              Envie contrato social, CNPJ e documento do titular em{" "}
              <b>Configurações → Documentos</b> para liberar saques.
            </p>
          </div>
        </div>
      )}

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
                disabled={!walletReady || requesting || disponivel < 500 || kyc !== "aprovado"}
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
                <div className="rounded-xl bg-muted p-3 text-xs space-y-1">
                  <p>
                    <b>PIX:</b> {estab?.pix_key ?? "—"}
                  </p>
                  <p>
                    <b>Titular:</b> {estab?.banco_titular ?? "—"}
                  </p>
                  <p>
                    <b>Doc:</b> {estab?.banco_documento ?? estab?.cnpj ?? "—"}
                  </p>
                </div>
                <Button className="w-full" onClick={solicitar} disabled={requesting}>
                  {requesting ? "Solicitando…" : "Confirmar saque"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <p className="text-sm text-muted-foreground">A liberar</p>
          <p className="mt-2 text-2xl font-black">{fmt(pendente)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <p className="text-sm text-muted-foreground">Total registrado</p>
          <p className="mt-2 text-2xl font-black">{fmt(total)}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Saldo de todo o histórico. Saques em aberto reservam saldo; valores a liberar aguardam
        confirmação administrativa do pagamento recebido.
      </p>

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
                  {w.motivo_recusa && (
                    <p className="text-xs text-red-500 mt-1">Motivo: {w.motivo_recusa}</p>
                  )}
                </div>
                <Badge
                  variant={
                    w.status === "pago"
                      ? "default"
                      : w.status === "recusado"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {w.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
