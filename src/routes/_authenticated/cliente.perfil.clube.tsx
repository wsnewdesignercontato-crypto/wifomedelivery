import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Crown, Check, Truck, Sparkles, BadgePercent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import clubeBanner from "@/assets/clube-wifome-banner.png.asset.json";

export const Route = createFileRoute("/_authenticated/cliente/perfil/clube")({
  component: ClubePage,
});

function ClubePage() {
  const beneficios = [
    { icon: Truck, title: "Frete grátis ilimitado", desc: "Em pedidos elegíveis acima de R$ 20" },
    { icon: BadgePercent, title: "Descontos exclusivos", desc: "Cupons semanais só para membros" },
    { icon: Sparkles, title: "Suporte prioritário", desc: "Atendimento em até 2 minutos" },
    { icon: Crown, title: "Acesso antecipado", desc: "Novidades e restaurantes primeiro" },
  ];

  return (
    <div className="space-y-5">
      <Link to="/cliente/perfil" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ChevronLeft className="h-4 w-4" /> Voltar
      </Link>

      <div className="relative overflow-hidden rounded-3xl bg-black shadow-xl ring-1 ring-white/5">
        <div className="aspect-[16/9] w-full">
          <img
            src={clubeBanner.url}
            alt="Clube WiFome — assine e economize em cada pedido"
            className="h-full w-full object-cover object-center"
            loading="eager"
          />
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
        {beneficios.map((b) => {
          const Icon = b.icon;
          return (
            <div key={b.title} className="flex items-start gap-3 rounded-xl p-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{b.title}</p>
                <p className="text-xs text-muted-foreground">{b.desc}</p>
              </div>
              <Check className="ml-auto h-5 w-5 text-primary" />
            </div>
          );
        })}
      </div>

      <Button
        className="w-full"
        size="lg"
        onClick={() => toast.info("Assinatura em breve!")}
      >
        Assinar Clube WiFome
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">
        Cancele a qualquer momento. Sem multa.
      </p>
    </div>
  );
}
