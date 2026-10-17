import { useCallback, useEffect, useRef, useState } from "react";
import { APP_PROFILES, systemInstallationEvidence, type PerfilApp } from "@/lib/app-profiles";
import { isProfileInstallDocument } from "@/lib/install-document";
import { RUNNING_APP_KEY, runningAppProfile } from "@/lib/pwa-launch";
import {
  currentPwaInstallation,
  observePwaInstallation,
  type PwaInstallationEvidence,
} from "@/lib/pwa-installation";
export type { PerfilApp } from "@/lib/app-profiles";
type InstallNavigator = Navigator & {
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<Array<{ platform?: string; id?: string; url?: string }>>;
};

export function perfilInstaladoEmExecucao(): PerfilApp | null {
  if (typeof window === "undefined") return null;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as InstallNavigator).standalone === true;
  if (!standalone) return null;
  let savedProfile: string | null = null;
  try {
    savedProfile = window.sessionStorage.getItem(RUNNING_APP_KEY);
  } catch {
    // A launch URL can still identify the app when storage is unavailable.
  }
  const profile = runningAppProfile({
    standalone: !!standalone,
    origin: window.location.origin,
    search: window.location.search,
    savedProfile,
  });
  if (profile) {
    try {
      window.sessionStorage.setItem(RUNNING_APP_KEY, profile);
    } catch {
      // Keep detecting this launch from its URL.
    }
  }
  return profile;
}
export function useAppInstalado(profile: PerfilApp) {
  const [evidence, setEvidence] = useState<PwaInstallationEvidence | null>(null);
  const generation = useRef(0);
  const active = useRef(false);
  const revalidar = useCallback(async () => {
    const request = ++generation.current;
    const api = (navigator as InstallNavigator).getInstalledRelatedApps;
    const running = perfilInstaladoEmExecucao();
    const scope = APP_PROFILES[profile].scope;
    const inScope =
      window.location.pathname === scope || window.location.pathname.startsWith(scope + "/");
    const installed = await systemInstallationEvidence(
      profile,
      window.location.origin,
      running,
      inScope && typeof api === "function" ? () => api.call(navigator) : undefined,
    );
    if (!active.current || request !== generation.current)
      return currentPwaInstallation(profile)?.installed ?? false;
    let proof = currentPwaInstallation(profile);
    // Android emits appinstalled before WebAPK creation finishes; do not erase this fresh evidence.
    const pendingWebApk =
      proof?.evidence === "appinstalled" && Date.now() - proof.observedAt < 90000;
    if (installed !== null && !(installed === false && pendingWebApk)) {
      proof = observePwaInstallation(
        profile,
        window.location.origin,
        installed,
        running === profile ? "standalone" : "browser-query",
      );
    }
    setEvidence(proof);
    return proof?.installed ?? false;
  }, [profile]);
  useEffect(() => {
    active.current = true;
    const invalidate = () => {
      generation.current++;
    };
    const refresh = () => {
      if (active.current && document.visibilityState !== "hidden") void revalidar();
    };
    const installed = () => {
      if (!isProfileInstallDocument(profile)) return;
      try {
        window.sessionStorage.setItem(RUNNING_APP_KEY, profile);
      } catch {
        // The in-memory installation event still confirms this profile.
      }
      invalidate();
      if (active.current)
        setEvidence(observePwaInstallation(profile, window.location.origin, true, "appinstalled"));
    };
    const installable = () => {
      if (!isProfileInstallDocument(profile)) return;
      invalidate();
      if (active.current) setEvidence(null);
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    const mode = window.matchMedia?.("(display-mode: standalone)");
    mode?.addEventListener?.("change", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("appinstalled", installed);
    window.addEventListener("beforeinstallprompt", installable);
    return () => {
      active.current = false;
      invalidate();
      clearInterval(timer);
      mode?.removeEventListener?.("change", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("appinstalled", installed);
      window.removeEventListener("beforeinstallprompt", installable);
    };
  }, [profile, revalidar]);
  return { instalado: evidence?.installed === true, evidence, revalidar };
}
