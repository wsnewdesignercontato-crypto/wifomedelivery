import { useCallback, useEffect, useRef, useState } from "react";
import type { PerfilApp } from "@/lib/app-profiles";
import {
  dismissPermissionPrompt,
  permissionPromptDismissed,
  readInstalledPermissions,
  requestInstalledLocation,
  requestInstalledNotifications,
  type InstalledPermissions,
} from "@/lib/installed-permissions";
import { PUSH_PREFERENCES_CHANGED } from "@/lib/push-subscription";
import { subscribeDevicePreferences } from "@/lib/device-preferences";

const INITIAL: InstalledPermissions = {
  installed: false,
  notifications: "unknown",
  location: "unknown",
  locationEnabled: true,
  pushOptIn: null,
};

export function useInstalledPermissions(profile: PerfilApp) {
  const [snapshot, setSnapshot] = useState(INITIAL);
  const [dismissed, setDismissed] = useState(true);
  const [busy, setBusy] = useState<"notifications" | "location" | null>(null);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  const generation = useRef(0);
  const locationGranted = useRef(false);
  const locationRequest = useRef<AbortController | null>(null);
  const cancelLocation = useCallback(() => {
    locationRequest.current?.abort();
    locationRequest.current = null;
  }, []);
  const invalidateRefresh = useCallback(() => {
    generation.current++;
  }, []);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    const next = await readInstalledPermissions();
    if (!mounted.current || current !== generation.current) return;
    if (next.location === "unknown" && locationGranted.current) next.location = "granted";
    if (next.location === "denied" || next.location === "unsupported")
      locationGranted.current = false;
    setSnapshot(next);
    setDismissed(permissionPromptDismissed(profile));
  }, [profile]);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    locationGranted.current = false;
    void refresh();
    const changed = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    const media = window.matchMedia?.("(display-mode: standalone)");
    media?.addEventListener?.("change", changed);
    window.addEventListener("focus", changed);
    window.addEventListener(PUSH_PREFERENCES_CHANGED, changed);
    document.addEventListener("visibilitychange", changed);
    const stopPreferences = subscribeDevicePreferences(changed);
    const statuses: PermissionStatus[] = [];
    if (media?.matches || (navigator as Navigator & { standalone?: boolean }).standalone) {
      for (const name of ["geolocation", "notifications"] as PermissionName[]) {
        void navigator.permissions
          ?.query({ name })
          .then((status) => {
            if (!active) return;
            status.addEventListener("change", changed);
            statuses.push(status);
          })
          .catch(() => {});
      }
    }
    const timer = window.setInterval(changed, 30000);
    return () => {
      active = false;
      mounted.current = false;
      invalidateRefresh();
      cancelLocation();
      window.clearInterval(timer);
      media?.removeEventListener?.("change", changed);
      window.removeEventListener("focus", changed);
      window.removeEventListener(PUSH_PREFERENCES_CHANGED, changed);
      document.removeEventListener("visibilitychange", changed);
      stopPreferences();
      for (const status of statuses) status.removeEventListener("change", changed);
    };
  }, [refresh, invalidateRefresh, cancelLocation]);

  const notifications = async () => {
    if (busy) return;
    setBusy("notifications");
    setError("");
    const result = await requestInstalledNotifications();
    if (!mounted.current) return;
    setSnapshot((previous) => ({
      ...previous,
      notifications: result,
      pushOptIn: result === "granted" ? true : previous.pushOptIn,
    }));
    if (result === "denied")
      setError(
        "As notificações estão bloqueadas. Você pode liberá-las nos ajustes do celular ou continuar por enquanto.",
      );
    else if (result !== "granted")
      setError(
        "A autorização não foi concluída. Você pode tentar novamente ou continuar por enquanto.",
      );
    setBusy(null);
  };

  const location = async () => {
    if (busy) return;
    setBusy("location");
    setError("");
    cancelLocation();
    const controller = new AbortController();
    locationRequest.current = controller;
    const result = await requestInstalledLocation(controller.signal);
    if (!mounted.current || controller.signal.aborted) return;
    locationRequest.current = null;
    locationGranted.current = result === "granted";
    setSnapshot((previous) => ({
      ...previous,
      location: result,
      locationEnabled: result === "granted" ? true : previous.locationEnabled,
    }));
    if (result === "denied")
      setError(
        "A localização está bloqueada. Você pode liberá-la nos ajustes do celular ou continuar por enquanto.",
      );
    else if (result !== "granted")
      setError(
        "Não foi possível obter sua localização. Confira o GPS do celular e tente novamente quando quiser.",
      );
    setBusy(null);
  };

  const dismiss = () => {
    cancelLocation();
    setBusy(null);
    dismissPermissionPrompt(profile);
    setDismissed(true);
  };
  return { snapshot, dismissed, busy, error, notifications, location, dismiss, refresh };
}
