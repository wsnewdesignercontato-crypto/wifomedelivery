import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen } from "@/components/auth-screen";
import { authSearchSchema } from "@/lib/auth-search";
import { APP_PROFILES } from "@/lib/app-profiles";

export const Route = createFileRoute("/_authenticated/cliente/entrar")({
  validateSearch: authSearchSchema,
  head: () => ({ meta: [{ title: "Entrar | " + APP_PROFILES.cliente.name }] }),
  component: LoginPage,
});
function LoginPage() {
  return <AuthScreen search={Route.useSearch()} profile="cliente" />;
}
