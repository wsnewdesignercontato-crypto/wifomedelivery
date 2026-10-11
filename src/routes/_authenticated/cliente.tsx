import { createFileRoute } from "@tanstack/react-router";
import { ClienteShell } from "@/components/cliente/cliente-shell";
import { OnboardingGate } from "@/components/onboarding-gate";

export const Route = createFileRoute("/_authenticated/cliente")({
  head: () => ({ meta: [
    { title: "Cliente | PedeTrem" },
    { name: "description", content: "PedeTrem: cliente." },
    { property: "og:title", content: "Cliente | PedeTrem" },
    { property: "og:description", content: "PedeTrem: cliente." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ClienteLayout,
});

function ClienteLayout() {
  const { user } = Route.useRouteContext() as { user: { id: string; email?: string } };
  return (
    <OnboardingGate role="cliente" userId={user.id}>
      <ClienteShell user={user} />
    </OnboardingGate>
  );
}
