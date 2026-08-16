import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, Gift, Ticket, Coins, Trophy, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/cliente/perfil/recompensas")({
  component: RecompensasPage,
});

// Regras de fidelidade
// Bronze: 3+ pedidos entregues • Prata: 10+ • Ouro: 20+
// Cashback: 0,5% do total gasto em pedidos entregues
const CASHBACK_RATE = 0.005;

type Tier = { nome: string; min: number; proximo?: { nome: string; min: number } };
const TIERS: Tier[] = [
  { nome: "Iniciante", min: 0, proximo: { nome: "Bronze", min: 3 } },
  { nome: "Bronze", min: 3, proximo: { nome: "Prata", min: 10 } },
  { nome: "Prata", min: 10, proximo: { nome: "Ouro", min: 20 } },
  { nome: "Ouro", min: 20 },
];

function nivelPara(pedidos: number): Tier {
  return [...TIERS].reverse().find((t) => pedidos >= t.min) ?? TIERS[0];
}

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function RecompensasPage() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const [loading, setLoading] = useState(true);
  const [pedidos, setPedidos] = useState(0);
  const [totalGastoCents, setTotalGastoCents] = useState(0);
  const [copied, setCopied] = useState(false);

  const codigoConvite = `WIFI-${user.id.slice(0, 6).toUpperCase()}`;

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("total_cents,status")
        .eq("cliente_id", user.id)
        .eq("status", "delivered");
      const rows = data ?? [];
      setPedidos(rows.length);
      setTotalGastoCents(rows.reduce((s, r) => s + (r.total_cents ?? 0), 0));
      setLoading(false);
    })();
  }, [user.id]);

  const tier = nivelPara(pedidos);
  const faltam = tier.proximo ? Math.max(0, tier.proximo.min - pedidos) : 0;
  const cashbackCents = Math.floor(totalGastoCents * CASHBACK_RATE);

  async function copiarCodigo() {
    await navigator.clipboard.writeText(codigoConvite);
    setCopied(true);
    toast.success("Código copiado!");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-5">
      <Link
        to="/cliente/perfil"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <Gift className="h-5 w-5 text-primary" /> Recompensas e benefícios
      </h1>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-primary">
                <Coins className="h-5 w-5" />
                <span className="text-sm font-semibold">Cashback disponível</span>
              </div>
              <p className="mt-2 text-2xl font-black">{brl(cashbackCents)}</p>
              <p className="text-xs text-muted-foreground">
                Você recebe 0,5% de volta em cada pedido — a cada R$ 100 gastos, R$ 0,50 de
                cashback.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-primary">
                <Trophy className="h-5 w-5" />
                <span className="text-sm font-semibold">Nível</span>
              </div>
              <p className="mt-2 text-2xl font-black">{tier.nome}</p>
              <p className="text-xs text-muted-foreground">
                {tier.proximo
                  ? `Faça mais ${faltam} pedido${faltam === 1 ? "" : "s"} para virar ${tier.proximo.nome}`
                  : "Você chegou ao nível máximo 🏆"}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Bronze: 3 pedidos • Prata: 10 • Ouro: 20
              </p>
            </div>
          </div>

          <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Ticket className="h-4 w-4 text-primary" /> Meus cupons
            </h2>
            <p className="text-xs text-muted-foreground">
              Nenhum cupom ativo no momento. Fique de olho nas promoções semanais.
            </p>
          </section>

          <section className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4 text-sm">
            <p className="font-semibold text-primary">Convide amigos e ganhe 15% de desconto</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Para cada amigo que fizer o primeiro pedido usando seu código, vocês dois ganham 15%
              de desconto no próximo pedido.
            </p>
            <button
              onClick={copiarCodigo}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-background px-3 py-1.5 font-mono text-sm font-bold text-primary hover:bg-primary/10"
            >
              {codigoConvite}
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
