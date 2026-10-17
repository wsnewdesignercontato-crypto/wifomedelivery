import { APP_PROFILES, type PerfilApp } from "./app-profiles";

// Capture the server-supplied manifest before React can navigate to another profile.
const initialManifest =
  typeof document === "undefined"
    ? null
    : (document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.getAttribute("href") ??
      null);
const initialPath = typeof window === "undefined" ? null : window.location.pathname;

export function isProfileInstallDocument(profile: PerfilApp): boolean {
  if (!initialManifest || typeof window === "undefined") return false;
  try {
    const url = new URL(initialManifest, window.location.origin);
    return (
      url.origin === window.location.origin &&
      window.location.origin === APP_PROFILES[profile].origin &&
      url.pathname === APP_PROFILES[profile].manifest &&
      !!initialPath?.startsWith(APP_PROFILES[profile].scope)
    );
  } catch {
    return false;
  }
}
