import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/entregador/chat")({
  head: () => ({
    meta: [
      { title: "Entregador — Chat | PedeTrem" },
      { name: "description", content: "PedeTrem: entregador, chat." },
      { property: "og:title", content: "Entregador — Chat | PedeTrem" },
      { property: "og:description", content: "PedeTrem: entregador, chat." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Chat,
});

function Chat() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Chat</h1>
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
        <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          Durante uma corrida ativa, você pode conversar com a loja, o cliente e o suporte
          diretamente na tela da corrida.
        </p>
        <Link
          to="/entregador/corridas"
          className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Abrir minhas corridas
        </Link>
      </div>
    </div>
  );
}
