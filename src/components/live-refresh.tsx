import { useEffect } from "react";
import { AppUpdatePrompt } from "@/components/app-update-prompt";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { DATA_UPDATED_EVENT, PROFILE_UPDATED_EVENT } from "@/lib/app-refresh";
import { useDevicePreferences } from "@/hooks/use-device-preferences";

/**
 * Mantém o app sempre atualizado: revalida dados após qualquer salvamento,
 * ao voltar para a aba, ao reconectar, e oferece novas versões para atualizar.
 */
export function LiveRefresh() {
  const { prefs } = useDevicePreferences();
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    const refresh = () => {
      queryClient.invalidateQueries();
      router.invalidate();
    };

    const onVisible = () => {
      if (!prefs.economia_dados && document.visibilityState === "visible") refresh();
    };
    const onFocus = () => {
      if (!prefs.economia_dados) refresh();
    };

    window.addEventListener(DATA_UPDATED_EVENT, refresh);
    window.addEventListener(PROFILE_UPDATED_EVENT, refresh);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(DATA_UPDATED_EVENT, refresh);
      window.removeEventListener(PROFILE_UPDATED_EVENT, refresh);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, queryClient, prefs.economia_dados]);

  return <AppUpdatePrompt />;
}
