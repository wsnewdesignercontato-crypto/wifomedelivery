import { createFileRoute } from "@tanstack/react-router";
import { ClienteShell } from "@/components/cliente/cliente-shell";
import { OnboardingGate } from "@/components/onboarding-gate";

export const Route = createFileRoute("/_authenticated/cliente")({
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
