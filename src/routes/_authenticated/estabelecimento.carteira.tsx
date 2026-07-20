import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Wallet, ArrowUpRight, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useMyEstab, fmt } from "@/hooks/use-my-estab";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/estabelecimento/carteira")({
  component: Carteira,
});

type Ledger = { id: string; merchant_payout_cents: number; status: string; created_at: string };
type Withdrawal = { id: string; valor_cents: number; metodo: string; status: string; created_at: string; motivo_recusa: string | null };

function Carteira() {
  const { estab, userId } = useMyEstab();
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [valor, setValor] = useState("");
  const [open, setOpen] = useState(false);
  const [kyc, setKyc] = useState<string>("pendente");

  const disponivel = ledger.filter((l) => l.status === "paid").reduce((s, l) => s + l.merchant_payout_cents, 0)
    - withdrawals.filter((w) => w.status === "pago" || w.status === "aprovado").reduce((s, w) => s + w.valor_cents, 0);
  const pendente = ledger.filter((l) => l.status === "pending").reduce((s, l) => s + l.merchant_payout_cents, 0);
  const total = ledger.reduce((s, l) => s + l.merchant_payout_cents, 0);

  async function load() {
    if (!estab) return;
    const { data: e } = await supabase.from("establishments").select("kyc_status").eq("id", estab.id).maybeSingle();
    setKyc((e as { kyc_status?: string } | null)?.kyc_status ?? "pendente");
    const { data: l } = await supabase.from("platform_ledger")
      .select("id,merchant_payout_cents,status,created_at")
      .eq("establishment_id", estab.id).order("created_at", { ascending: false }).limit(100);
    setLedger((l ?? []) as Ledger[]);
    const { data: w } = await supabase.from("establishment_withdrawals")
      .select("id,valor_cents,metodo,status,created_at,motivo_recusa")
      .eq("establishment_id", estab.id).order("created_at", { ascending: false }).limit(50);
    setWithdrawals((w ?? []) as Withdrawal[]);
  }
  useEffect(() => { load(); }, [estab?.id]);

  async function solicitar() {
    if (!estab) return;
    if (kyc !== "aprovado") return toast.error("Conta não validada. Envie os documentos para aprovação.");
    if (!estab.pix_key) return toast.error("Cadastre a chave PIX nas configurações");
    if (!estab.banco_titular) return toast.error("Cadastre o titular da conta");
    const cents = Math.round(Number(valor.replace(",", ".")) * 100);
    if (!cents || cents < 500) return toast.error("Valor mínimo R$ 5,00");
    if (cents > disponivel) return toast.error("Valor acima do saldo disponível");
    const { error } = await supabase.from("establishment_withdrawals").insert({
      establishment_id: estab.id,
      requested_by: userId,
      valor_cents: cents,
      metodo: "pix",
      pix_key: estab.pix_key,
      titular_nome: estab.banco_titular,
      titular_documento: estab.banco_documento ?? estab.cnpj,
      banco_info: {
        banco: estab.banco_nome, agencia: estab.banco_agencia,
        conta: estab.banco_conta, tipo: estab.banco_tipo,
      },
      liquido_cents: cents,
    });
    if (error) return toast.error(error.message);
    toast.success("Saque solicitado! Aguardando aprovação.");
    setValor(""); setOpen(false); load();
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
              Envie contrato social, CNPJ e documento do titular em <b>Configurações → Documentos</b> para liberar saques.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-primary bg-gradient-brand p-6 text-primary-foreground shadow-brand">
          <div className="flex items-center gap-2 text-sm opacity-90"><Wallet className="h-4 w-4" /> Disponível</div>
          <p className="mt-2 text-3xl font-black">{fmt(disponivel)}</p>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="mt-3 bg-white text-primary hover:bg-white/90" size="sm" disabled={disponivel < 500 || kyc !== "aprovado"}>
                <ArrowUpRight className="mr-2 h-4 w-4" /> Solicitar saque
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Solicitar saque PIX</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Valor</Label><Input placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
                <div className="rounded-xl bg-muted p-3 text-xs space-y-1">
                  <p><b>PIX:</b> {estab?.pix_key ?? "—"}</p>
                  <p><b>Titular:</b> {estab?.banco_titular ?? "—"}</p>
                  <p><b>Doc:</b> {estab?.banco_documento ?? estab?.cnpj ?? "—"}</p>
                </div>
                <Button className="w-full" onClick={solicitar}>Confirmar saque</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <p className="text-sm text-muted-foreground">A liberar</p>
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
          <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">Nenhum saque solicitado.</p>
        ) : (
          <div className="space-y-2">
            {withdrawals.map((w) => (
              <div key={w.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-card">
                <div>
                  <p className="font-semibold">{fmt(w.valor_cents)}</p>
                  <p className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleString("pt-BR")} · {w.metodo.toUpperCase()}</p>
                  {w.motivo_recusa && <p className="text-xs text-red-500 mt-1">Motivo: {w.motivo_recusa}</p>}
                </div>
                <Badge variant={w.status === "pago" ? "default" : w.status === "recusado" ? "destructive" : "secondary"}>{w.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
