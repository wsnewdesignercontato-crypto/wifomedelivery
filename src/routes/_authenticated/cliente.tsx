import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { ClienteShell } from "@/components/cliente/cliente-shell";

export const Route = createFileRoute("/_authenticated/cliente")({
  head: () => ({
    meta: [
      { title: "Cliente | PedeTrem" },
      { name: "description", content: "PedeTrem: cliente." },
      { property: "og:title", content: "Cliente | PedeTrem" },
      { property: "og:description", content: "PedeTrem: cliente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClienteLayout,
});

function ClienteLayout() {
  const location = useLocation();
  const { user } = Route.useRouteContext() as { user: { id: string; email?: string } };
  if (location.pathname.replace(/\/$/, "") === "/cliente/entrar") return <Outlet />;
  return <ClienteShell user={user} />;
}
