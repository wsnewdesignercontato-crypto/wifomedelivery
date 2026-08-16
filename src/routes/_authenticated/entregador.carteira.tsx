import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Clock3,
  CreditCard,
  Landmark,
  Loader2,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
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

type Ledger = {
  id: string;
  courier_payout_cents: number;
  status: string;
  created_at: string;
};
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

  const summary = useMemo(() => {
    const saquesPendentes = withdrawals.filter((w) => w.status !== "pago").length;
    const totalSaques = withdrawals.reduce((sum, w) => sum + (w.valor_cents ?? 0), 0);
    return { saquesPendentes, totalSaques };
  }, [withdrawals]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courier?.user_id]);

  async function solicitar() {
    if (!courier) return;
    const cents = Math.round(Number(valor.replace(",", ".")) * 100);
    if (!cents || cents < 500) return toast.error("Valor minimo R$ 5,00");
    if (cents > disponivel) return toast.error("Valor acima do saldo disponivel");
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

  if (!courier) {
    return (
      <div className="card-premium rounded-[1.75rem] p-6">
        <h1 className="text-2xl font-black tracking-tight">Carteira do entregador</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Complete seu perfil para acompanhar repasses, saldo disponivel e solicitacoes de saque.
        </p>
        <div className="mt-4">
          <Link
            to="/entregador/perfil"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-brand"
          >
            Finalizar perfil
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="card-premium relative overflow-hidden border-none bg-gradient-to-br from-primary/12 via-white to-primary/5 p-5 dark:from-primary/15 dark:via-card dark:to-primary/10 sm:p-6">
        <div className="absolute -left-10 top-0 h-36 w-36 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -right-10 bottom-0 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative grid gap-6 xl:grid-cols-[1.1fr_0.9fr] xl:items-start">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary text-primary-foreground">Carteira premium</Badge>
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                Repasses e saques
              </Badge>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-muted-foreground">
                Mais clareza para acompanhar o que entrou, o que ja esta liberado e o que ainda esta
                em processamento.
              </p>
              <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
                Seu dinheiro com leitura mais forte e saque mais rapido.
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                Visualize saldo, acompanhe repasses do ledger e solicite PIX com menos friccao.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <HeroMetric label="Disponivel" value={fmt(disponivel)} hint="Pronto para solicitar" />
              <HeroMetric label="Pendente" value={fmt(pendente)} hint="Aguardando liberacao" />
              <HeroMetric label="Total recebido" value={fmt(total)} hint="Historico acumulado" />
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-card backdrop-blur dark:border-border dark:bg-card/90">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-muted-foreground">
                  Painel rapido
                </p>
                <p className="mt-2 text-2xl font-black text-foreground">
                  {summary.saquesPendentes} saques em fila
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Wallet className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Chave PIX
                </p>
                <p className="mt-1 font-bold text-foreground">
                  {courier.pix_key ? "Configurada" : "Nao configurada"}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Saques totais
                </p>
                <p className="mt-1 font-bold text-foreground">{fmt(summary.totalSaques)}</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-border/70 bg-background/70 p-3">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                Regra de saque
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                Minimo de R$ 5,00 por solicitacao e envio via PIX.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <StatCard
          icon={Wallet}
          label="Saldo disponivel"
          value={fmt(disponivel)}
          hint="Ja pode virar saque"
          emphasis
        >
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                className="mt-4 rounded-full bg-white text-primary hover:bg-white/90"
                size="sm"
                disabled={disponivel < 500 || !courier.pix_key}
              >
                <ArrowUpRight className="mr-2 h-4 w-4" />
                Solicitar saque
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Solicitar saque PIX</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Valor</Label>
                  <Input
                    placeholder="0,00"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                  />
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/40 p-3 text-sm">
                  <p className="font-semibold text-foreground">Chave PIX</p>
                  <p className="mt-1 text-muted-foreground">
                    {courier.pix_key ?? "Cadastre sua chave no perfil antes de solicitar."}
                  </p>
                </div>
                <Button
                  className="w-full rounded-full"
                  onClick={solicitar}
                  disabled={!courier.pix_key}
                >
                  Confirmar saque
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </StatCard>
        <StatCard
          icon={Clock3}
          label="Em processamento"
          value={fmt(pendente)}
          hint="Rodas concluidas aguardando repasse"
        />
        <StatCard
          icon={Landmark}
          label="Movimento total"
          value={fmt(total)}
          hint="Tudo que ja entrou no ledger"
        />
      </div>

      <section className="card-premium border-none bg-gradient-to-br from-card to-muted/20 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Saques
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground">
              Acompanhe cada solicitacao com mais contexto.
            </h2>
          </div>
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            {withdrawals.length} registros
          </Badge>
        </div>

        {withdrawals.length === 0 ? (
          <div className="mt-4 rounded-[1.5rem] border border-dashed border-border bg-background/60 p-8 text-center text-sm text-muted-foreground">
            Nenhum saque solicitado ainda.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {withdrawals.map((w) => (
              <div
                key={w.id}
                className="rounded-[1.5rem] border border-border/70 bg-background/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-black text-foreground">{fmt(w.valor_cents)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {new Date(w.created_at).toLocaleDateString("pt-BR")} as{" "}
                      {new Date(w.created_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {w.metodo.toUpperCase()}
                    </p>
                  </div>
                  <Badge className={withdrawalTone(w.status)}>{w.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card-premium border-none bg-gradient-to-br from-card to-muted/20 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Extrato premium
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground">
              Repasses por corrida, organizados para leitura rapida.
            </h2>
          </div>
          <Badge
            variant="outline"
            className="border-border/70 bg-background/70 text-muted-foreground"
          >
            Ultimos {Math.min(ledger.length, 20)} lancamentos
          </Badge>
        </div>

        {ledger.length === 0 ? (
          <div className="mt-4 rounded-[1.5rem] border border-dashed border-border bg-background/60 p-8 text-center text-sm text-muted-foreground">
            Sem lancamentos por enquanto.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {ledger.slice(0, 20).map((l) => (
              <div
                key={l.id}
                className="rounded-[1.5rem] border border-border/70 bg-background/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="inline-flex items-center gap-2 text-sm font-bold text-foreground">
                      <CreditCard className="h-4 w-4 text-primary" />
                      Corrida registrada
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {new Date(l.created_at).toLocaleDateString("pt-BR")} as{" "}
                      {new Date(l.created_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-primary">{fmt(l.courier_payout_cents)}</p>
                    <Badge variant="outline" className="mt-2 text-[10px] uppercase">
                      {l.status}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function HeroMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-border dark:bg-card/80">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  emphasis = false,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  emphasis?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={
        emphasis
          ? "rounded-[1.75rem] border border-primary bg-gradient-brand p-6 text-primary-foreground shadow-brand"
          : "card-premium rounded-[1.75rem] border-none bg-gradient-to-br from-card to-muted/20 p-6"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className={`text-xs font-semibold uppercase tracking-[0.18em] ${
              emphasis ? "text-primary-foreground/80" : "text-muted-foreground"
            }`}
          >
            {label}
          </p>
          <p
            className={`mt-2 text-3xl font-black ${emphasis ? "text-primary-foreground" : "text-foreground"}`}
          >
            {value}
          </p>
        </div>
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
            emphasis ? "bg-white/15 text-primary-foreground" : "bg-primary/10 text-primary"
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p
        className={`mt-2 text-sm ${emphasis ? "text-primary-foreground/80" : "text-muted-foreground"}`}
      >
        {hint}
      </p>
      {children}
    </div>
  );
}

function withdrawalTone(status: string) {
  if (status === "pago") return "bg-emerald-500 text-white hover:bg-emerald-500/90";
  if (status === "aprovado") return "bg-primary text-primary-foreground hover:bg-primary/90";
  if (status === "recusado")
    return "bg-destructive text-destructive-foreground hover:bg-destructive/90";
  return "bg-muted text-muted-foreground hover:bg-muted";
}
