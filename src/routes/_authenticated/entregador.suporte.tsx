import { createFileRoute } from "@tanstack/react-router";
import { SupportTickets } from "@/components/support-tickets";

export const Route = createFileRoute("/_authenticated/entregador/suporte")({
  head: () => ({
    meta: [
      { title: "Entregador — Suporte | PedeTrem" },
      { name: "description", content: "PedeTrem: entregador, suporte." },
      { property: "og:title", content: "Entregador — Suporte | PedeTrem" },
      { property: "og:description", content: "PedeTrem: entregador, suporte." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Suporte,
});

function Suporte() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">Suporte</h1>
      <SupportTickets />
    </div>
  );
}
