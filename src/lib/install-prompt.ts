import { isProfileInstallDocument } from "./install-document";
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
  });
  window.addEventListener("appinstalled", () => {
    pending = null;
  });
}

export function getInstallPrompt(profile: PerfilApp): InstallEvent | null {
  return isProfileInstallDocument(profile) ? pending : null;
}

export function clearInstallPrompt(): void {
  pending = null;
}
