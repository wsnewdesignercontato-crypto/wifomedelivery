import { useCallback, useEffect, useState } from "react";
import {
  appProfileFromUrl,
  isAppProfile,
  systemInstallationEvidence,
  type PerfilApp,
} from "@/lib/app-profiles";
import { isProfileInstallDocument } from "@/lib/install-document";
export type { PerfilApp } from "@/lib/app-profiles";
type InstallNavigator = Navigator & {
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<Array<{ platform?: string; id?: string; url?: string }>>;
};
const sessionConfirmed = new Set<PerfilApp>();

export function perfilInstaladoEmExecucao(): PerfilApp | null {
  if (typeof window === "undefined") return null;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as InstallNavigator).standalone === true;
  if (!standalone) return null;
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
  const [instalado, setInstalado] = useState(false);
  const revalidar = useCallback(async () => {
    const api = (navigator as InstallNavigator).getInstalledRelatedApps;
    const evidence = await systemInstallationEvidence(
      profile,
      window.location.origin,
      perfilInstaladoEmExecucao(),
      typeof api === "function" ? () => api.call(navigator) : undefined,
    );
    if (evidence !== null) {
      if (!evidence) sessionConfirmed.delete(profile);
      setInstalado(evidence);
      return evidence;
    }
    const installed = sessionConfirmed.has(profile);
    setInstalado(installed);
    return installed;
  }, [profile]);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active && document.visibilityState !== "hidden") void revalidar();
    };
    const installed = () => {
      if (!isProfileInstallDocument(profile)) return;
      sessionConfirmed.add(profile);
      if (active) setInstalado(true);
    };
    const installable = () => {
      if (!isProfileInstallDocument(profile)) return;
      sessionConfirmed.delete(profile);
      if (active) setInstalado(false);
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    const mode = window.matchMedia("(display-mode: standalone)");
    mode.addEventListener?.("change", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("appinstalled", installed);
    window.addEventListener("beforeinstallprompt", installable);
    return () => {
      active = false;
      clearInterval(timer);
      mode.removeEventListener?.("change", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("appinstalled", installed);
      window.removeEventListener("beforeinstallprompt", installable);
    };
  }, [profile, revalidar]);
  return { instalado, revalidar };
}
