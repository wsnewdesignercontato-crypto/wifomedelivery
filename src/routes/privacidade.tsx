import { createFileRoute } from "@tanstack/react-router";
import { PublicPolicy } from "@/components/public-policy";
export const Route = createFileRoute("/privacidade")({
  head: () => ({ meta: [{ title: "Política de privacidade | PedeTrem" }] }),
  component: () => <PublicPolicy kind="privacy" />,
});
