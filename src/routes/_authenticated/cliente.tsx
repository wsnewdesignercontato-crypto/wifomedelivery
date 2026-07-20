import { createFileRoute } from "@tanstack/react-router";
import { ClienteShell } from "@/components/cliente/cliente-shell";

export const Route = createFileRoute("/_authenticated/cliente")({
  component: ClienteLayout,
});

function ClienteLayout() {
  const { user } = Route.useRouteContext() as { user: { id: string; email?: string } };
  return <ClienteShell user={user} />;
}
