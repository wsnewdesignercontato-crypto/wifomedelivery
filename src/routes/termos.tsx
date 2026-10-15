import { createFileRoute } from "@tanstack/react-router";
import { PublicPolicy } from "@/components/public-policy";
export const Route = createFileRoute("/termos")({
  head: () => ({ meta: [{ title: "Termos de uso | PedeTrem" }] }),
  component: () => <PublicPolicy kind="terms" />,
});
