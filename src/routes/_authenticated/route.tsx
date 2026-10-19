import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { isPublicCustomerPath, loginProfile } from "@/lib/customer-access";
import { APP_PROFILES, isProfileLoginPath } from "@/lib/app-profiles";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    if (isProfileLoginPath(location.pathname))
      return { user: { id: "", email: undefined }, isGuest: true };
    const { data, error } = await supabase.auth.getUser();
    const unconfirmed = !!data.user && !data.user.email_confirmed_at;
    if (unconfirmed) await supabase.auth.signOut({ scope: "local" });
    if (error || !data.user || unconfirmed) {
      if (isPublicCustomerPath(location.pathname))
        return { user: { id: "", email: undefined }, isGuest: true };
      throw redirect({
        to: APP_PROFILES[loginProfile(location.pathname)].loginPath,
        search: {
          perfil: loginProfile(location.pathname),
          redirect: location.pathname + location.searchStr,
        },
      });
    }
    return { user: data.user, isGuest: false };
  },
  component: () => <Outlet />,
});
