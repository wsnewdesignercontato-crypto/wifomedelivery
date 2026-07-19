import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Escuta transições de identidade do Supabase e invalida router/queries.
 * Filtrado para evitar tempestades de refetch em TOKEN_REFRESHED / INITIAL_SESSION.
 */
export function AuthSync() {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") {
        return;
      }
      router.invalidate();
      if (event !== "SIGNED_OUT") {
        queryClient.invalidateQueries();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return null;
}
