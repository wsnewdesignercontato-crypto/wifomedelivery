import { SupportTickets } from "@/components/support-tickets";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, HelpCircle, ChevronDown } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/cliente/perfil/ajuda")({
  head: () => ({
    meta: [
      { title: "Cliente — Perfil — Ajuda | PedeTrem" },
      { name: "description", content: "PedeTrem: cliente, perfil, ajuda." },
      { property: "og:title", content: "Cliente — Perfil — Ajuda | PedeTrem" },
      { property: "og:description", content: "PedeTrem: cliente, perfil, ajuda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AjudaPage,
});

const FAQS = [
  {
    q: "Como acompanhar meu pedido?",
    a: "Vá em Pedidos e toque no pedido em andamento. Você verá o mapa em tempo real e o status atualizado.",
  },
  {
    q: "Posso cancelar um pedido?",
    a: "Sim, enquanto a loja ainda não aceitou. Após o aceite, entre em contato com o suporte.",
  },
  {
    q: "Como funciona o código de entrega?",
    a: "Informe os 4 dígitos ao entregador na hora da entrega para confirmar que o pedido chegou até você.",
  },
  {
    q: "Como pedir reembolso?",
    a: "Abra um chamado nesta página e informe o número do pedido. A equipe analisará sua solicitação.",
  },
];

function AjudaPage() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="space-y-5">
      <Link
        to="/cliente/perfil"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <HelpCircle className="h-5 w-5 text-primary" /> Ajuda e suporte
      </h1>

      <SupportTickets />

      <section className="space-y-2">
        <h2 className="px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Perguntas frequentes
        </h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={i} className={i > 0 ? "border-t border-border" : ""}>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left"
                >
                  <span className="text-sm font-semibold">{f.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen && <p className="px-4 pb-4 text-xs text-muted-foreground">{f.a}</p>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
