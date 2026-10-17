import { useCallback, useEffect, useRef, useState } from "react";
import {
  appProfileFromUrl,
  APP_PROFILES,
  isAppProfile,
  systemInstallationEvidence,
  type PerfilApp,
} from "@/lib/app-profiles";
import { isProfileInstallDocument } from "@/lib/install-document";
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
  const dedicated = Object.entries(APP_PROFILES).find(
    ([key, app]) => key !== "cliente" && app.origin === window.location.origin,
  )?.[0] as PerfilApp | undefined;
  if (dedicated) return dedicated;
  const launched = new URLSearchParams(window.location.search).get("app");
  try {
    if (isAppProfile(launched)) {
      sessionStorage.setItem("pedetrem:running-app", launched);
      return launched;
    }
    const saved = sessionStorage.getItem("pedetrem:running-app");
    if (isAppProfile(saved)) return saved;
    const profile = appProfileFromUrl(window.location.pathname, window.location.search);
    sessionStorage.setItem("pedetrem:running-app", profile);
    return profile;
  } catch {
    return appProfileFromUrl(window.location.pathname, window.location.search);
  }
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
