import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { APP_PROFILES, type PerfilApp } from "@/lib/app-profiles";
import { recordAppInstall } from "@/lib/app-install.functions";
import {
  createPwaInstallQueue,
  pwaInstallationId,
  type PwaInstallationEvidence,
} from "@/lib/pwa-installation";

export function PwaInstallSync({
  profile,
  evidence,
}: {
  profile: PerfilApp;
  evidence: PwaInstallationEvidence | null;
}) {
  const queue = useRef<ReturnType<typeof createPwaInstallQueue> | null>(null);
  if (!queue.current) queue.current = createPwaInstallQueue();
  const userId = useRouterState({
    select: (state) => {
      for (const match of state.matches) {
        const context = match.context as { user?: { id?: string }; isGuest?: boolean } | undefined;
        if (context?.isGuest === false && context.user?.id) return context.user.id;
      }
      return null;
    },
  });
  useEffect(() => {
    if (!userId || !evidence || window.location.origin !== APP_PROFILES[profile].origin) return;
    const installationId = pwaInstallationId(profile);
    if (!installationId) return;
    let active = true;
    let saved = false;
    let pending = false;
    const sync = async () => {
      if (!active || saved || pending || navigator.onLine === false) return;
      pending = true;
      try {
        await queue.current!(async () => {
          if (!active) return;
          await recordAppInstall({
            data: {
              appType: profile === "entregador" ? "entrega" : profile,
              installationId,
              installed: evidence.installed,
              evidence: evidence.evidence,
            },
          });
        });
        saved = true;
      } catch {
        // Retry on focus/reconnection; installation never depends on this record.
      } finally {
        pending = false;
      }
    };
    void sync();
    window.addEventListener("focus", sync);
    window.addEventListener("online", sync);
    return () => {
      active = false;
      window.removeEventListener("focus", sync);
      window.removeEventListener("online", sync);
    };
  }, [userId, profile, evidence]);
  return null;
}
