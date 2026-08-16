import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { DATA_UPDATED_EVENT, PROFILE_UPDATED_EVENT } from "@/lib/app-refresh";

/** Detecta se uma nova versão do app foi publicada. */
function useVersionWatcher() {
  const current = useRef<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    let cancelled = false;
    let reloading = false;

    async function fingerprint(): Promise<string | null> {
      try {
        const res = await fetch(window.location.origin + "/?v=" + Date.now(), {
          cache: "no-store",
        });
        const html = await res.text();
        const scripts = Array.from(html.matchAll(/src="([^"]*assets\/[^"]+\.js)"/g)).map(
          (m) => m[1],
        );
        return scripts.sort().join("|") || null;
      } catch {
        return null;
      }
    }

    async function hardReload() {
      if (reloading) return;
      reloading = true;
      try {
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.update().catch(() => undefined)));
        }
      } catch {
        /* ignora */
      }
      window.location.reload();
    }

    async function check() {
      const fp = await fingerprint();
      if (cancelled || !fp) return;
      if (current.current === null) {
        current.current = fp;
        return;
      }
      if (fp !== current.current) {
        current.current = fp;
        void hardReload();
      }
    }

    check();
    const id = window.setInterval(check, 20_000);
    const onVisible = () => document.visibilityState === "visible" && check();
    const onFocus = () => check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, []);
}

/**
 * Mantém o app sempre atualizado: revalida dados após qualquer salvamento,
 * ao voltar para a aba, ao reconectar, e recarrega quando sai uma nova versão.
 */
export function LiveRefresh() {
  const router = useRouter();
  const queryClient = useQueryClient();
  useVersionWatcher();

  useEffect(() => {
    const refresh = () => {
      queryClient.invalidateQueries();
      router.invalidate();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener(DATA_UPDATED_EVENT, refresh);
    window.addEventListener(PROFILE_UPDATED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(DATA_UPDATED_EVENT, refresh);
      window.removeEventListener(PROFILE_UPDATED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, queryClient]);

  return null;
}
