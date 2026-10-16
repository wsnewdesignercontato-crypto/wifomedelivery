import { createFileRoute, redirect } from "@tanstack/react-router";
import { authSearchSchema } from "@/lib/auth-search";
import { APP_PROFILES } from "@/lib/app-profiles";

// Keep existing links and email returns, but install/login inside each app's scope.
export const Route = createFileRoute("/auth")({
  validateSearch: authSearchSchema,
  beforeLoad: ({ search, location }) => {
    const profile = search.perfil ?? search.app ?? "cliente";
    throw redirect({
      to: APP_PROFILES[profile].loginPath,
      search,
      hash: location.hash,
      replace: true,
    });
  },
});
