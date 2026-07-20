import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Gift, Ticket, Coins, Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cliente/perfil/recompensas")({
  component: RecompensasPage,
});

function RecompensasPage() {
  return (
    <div className="space-y-5">
      <Link to="/cliente/perfil" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ChevronLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <Gift className="h-5 w-5 text-primary" /> Recompensas e benefícios
      </h1>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-primary">
            <Coins className="h-5 w-5" />
            <span className="text-sm font-semibold">Cashback disponível</span>
          </div>
          <p className="mt-2 text-2xl font-black">R$ 0,00</p>
          <p className="text-xs text-muted-foreground">Acumule 2% em cada pedido</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-primary">
            <Trophy className="h-5 w-5" />
            <span className="text-sm font-semibold">Nível</span>
          </div>
          <p className="mt-2 text-2xl font-black">Prata</p>
          <p className="text-xs text-muted-foreground">Faça 3 pedidos para virar Ouro</p>
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
        <p className="font-semibold text-primary">Convide amigos e ganhe R$ 15</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Para cada amigo que fizer o primeiro pedido usando seu código, vocês dois ganham crédito.
        </p>
      </section>
    </div>
  );
}
