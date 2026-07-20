import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/entregador/chat")({
  component: Chat,
});

function Chat() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Chat</h1>
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
        <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          Durante uma corrida ativa, você pode conversar com a loja, o cliente e o suporte diretamente na tela da corrida.
        </p>
      </div>
    </div>
  );
}
