import { createFileRoute } from "@tanstack/react-router";
import { SupportTickets } from "@/components/support-tickets";

export const Route = createFileRoute("/_authenticated/estabelecimento/suporte")({
  head: () => ({ meta: [{ title: "Loja — Suporte | PedeTrem" }] }),
  component: () => (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Suporte</h1>
      <SupportTickets />
    </div>
  ),
});
