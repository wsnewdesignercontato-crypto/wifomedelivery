import {
  isLocationEnabled,
  subscribeDevicePreferences,
  updateDevicePreference,
} from "./device-preferences.ts";
import { pushSupported } from "./push-config.ts";
import { devicePushEnabled, setDevicePushEnabled } from "./push-subscription.ts";
import type { PerfilApp } from "./app-profiles.ts";

export type AppPermission = "prompt" | "granted" | "denied" | "unsupported" | "unknown";
export type InstalledPermissions = {
  installed: boolean;
  notifications: AppPermission;
  location: AppPermission;
  locationEnabled: boolean;
  pushOptIn: boolean | null;
};

export function isInstalledApp(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return !!(
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone
  );
}

export function notificationPermission(): AppPermission {
  if (!pushSupported() || typeof Notification === "undefined") return "unsupported";
  return Notification.permission === "default" ? "prompt" : Notification.permission;
}

export async function readInstalledPermissions(): Promise<InstalledPermissions> {
  const installed = isInstalledApp();
  const snapshot: InstalledPermissions = {
    installed,
    notifications: "unknown",
    location: "unknown",
    locationEnabled: isLocationEnabled(),
    pushOptIn: devicePushEnabled(),
  };
  if (!installed) return snapshot;
  snapshot.notifications = notificationPermission();
  if (!navigator.geolocation) snapshot.location = "unsupported";
  else {
    try {
      snapshot.location = (await navigator.permissions.query({ name: "geolocation" })).state;
    } catch {
      // Some installed browsers expose GPS but not the Permissions API.
    }
  }
  return snapshot;
}

export function needsInstalledPermissions(snapshot: InstalledPermissions): boolean {
  return (
    snapshot.installed &&
    (snapshot.notifications !== "granted" ||
      snapshot.pushOptIn !== true ||
      snapshot.location !== "granted" ||
      !snapshot.locationEnabled)
  );
}

const temporaryDismissals = new Set<PerfilApp>();
const promptKey = (profile: PerfilApp) => `pedetrem:permission-prompt:${profile}:v1`;

export function permissionPromptDismissed(profile: PerfilApp): boolean {
  if (typeof window === "undefined") return false;
  if (temporaryDismissals.has(profile)) return true;
  try {
    return window.sessionStorage.getItem(promptKey(profile)) === "1";
  } catch {
    return temporaryDismissals.has(profile);
  }
}

export function dismissPermissionPrompt(profile: PerfilApp): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(promptKey(profile), "1");
  } catch {
    temporaryDismissals.add(profile);
  }
}

/** Called directly from a button, preserving the browser's user activation. */
export async function requestInstalledNotifications(): Promise<AppPermission> {
  const current = notificationPermission();
  if (current === "unsupported" || current === "denied") return current;
  if (current === "granted") {
    setDevicePushEnabled(true);
    return current;
  }
  try {
    const result = await Notification.requestPermission();
    if (result === "granted") setDevicePushEnabled(true);
    return result === "default" ? "prompt" : result;
  } catch {
    return "unknown";
  }
}

/** The native GPS result authorizes this session; setup never stores coordinates. */
export function requestInstalledLocation(signal?: AbortSignal): Promise<AppPermission> {
  if (typeof navigator === "undefined" || !navigator.geolocation)
    return Promise.resolve("unsupported");
  return new Promise((resolve) => {
    let settled = false;
    let stopPreferences = () => {};
    const finish = (result: AppPermission) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", cancel);
      stopPreferences();
      if (result === "granted") updateDevicePreference("localizacao", true);
      resolve(result);
    };
    const cancel = () => finish("unknown");
    if (signal?.aborted) {
      cancel();
      return;
    }
    signal?.addEventListener("abort", cancel, { once: true });
    stopPreferences = subscribeDevicePreferences(() => {
      if (!isLocationEnabled()) cancel();
    });
    try {
      navigator.geolocation.getCurrentPosition(
        () => finish("granted"),
        (error) => finish(error.code === 1 ? "denied" : "unknown"),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    } catch {
      finish("unknown");
    }
  });
}
