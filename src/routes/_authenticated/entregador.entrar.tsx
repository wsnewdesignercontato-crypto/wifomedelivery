import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen } from "@/components/auth-screen";
import { authSearchSchema } from "@/lib/auth-search";
import { APP_PROFILES } from "@/lib/app-profiles";

export const Route = createFileRoute("/_authenticated/entregador/entrar")({
  validateSearch: authSearchSchema,
  head: () => ({ meta: [{ title: "Entrar | " + APP_PROFILES.entregador.name }] }),
  component: LoginPage,
});
function LoginPage() {
  return <AuthScreen search={Route.useSearch()} profile="entregador" />;
}
