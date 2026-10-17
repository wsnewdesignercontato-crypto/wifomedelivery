import { initialInstallProfile, isProfileInstallDocument } from "./install-document";
import { clearCurrentPwaInstallation, observePwaInstallation } from "./pwa-installation.ts";
import type { PerfilApp } from "./app-profiles";

export type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let pending: InstallEvent | null = null;

// Capture at document startup, before loading screens and React effects can delay the banner.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    pending = event as InstallEvent;
    const profile = initialInstallProfile();
    if (profile) clearCurrentPwaInstallation(profile);
  });
  window.addEventListener("appinstalled", () => {
    pending = null;
    const profile = initialInstallProfile();
    if (profile) observePwaInstallation(profile, window.location.origin, true, "appinstalled");
  });
}

export function getInstallPrompt(profile: PerfilApp): InstallEvent | null {
  return isProfileInstallDocument(profile) ? pending : null;
}

export function clearInstallPrompt(): void {
  pending = null;
}

/** Consume before invoking the native UI: the browser accepts each offer only once. */
export function takeInstallPrompt(profile: PerfilApp): InstallEvent | null {
  const offer = getInstallPrompt(profile);
  if (offer) pending = null;
  return offer;
}
