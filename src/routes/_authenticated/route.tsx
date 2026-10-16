import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { isPublicCustomerPath, loginProfile } from "@/lib/customer-access";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      if (isPublicCustomerPath(location.pathname))
        return { user: { id: "", email: undefined }, isGuest: true };
      throw redirect({
        to: "/auth",
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
