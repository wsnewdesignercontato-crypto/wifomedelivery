import { APP_PROFILES, type PerfilApp } from "./app-profiles.ts";

export type PwaInstallationEvidence = {
  installed: boolean;
  evidence: "appinstalled" | "standalone" | "browser-query";
  observedAt: number;
};
export const PWA_INSTALLATION_CHANGED = "pedetrem:pwa-installation-changed";
const observed = new Map<PerfilApp, PwaInstallationEvidence>();
const deviceIds = new Map<PerfilApp, string>();
const postponed = new Map<PerfilApp, number>();
const INVITE_DELAY = 7 * 86400000;

/** Preserve observation order when an older network request is still in flight. */
export function createPwaInstallQueue() {
  let tail: Promise<void> = Promise.resolve();
  return (write: () => Promise<void>): Promise<void> => {
    const result = tail.then(write);
    tail = result.catch(() => {});
    return result;
  };
}

/** Session evidence is current; saved evidence is history, never proof of continued installation. */
export function currentPwaInstallation(profile: PerfilApp): PwaInstallationEvidence | null {
  return typeof window === "undefined" ? null : (observed.get(profile) ?? null);
}

export function clearCurrentPwaInstallation(profile: PerfilApp): void {
  observed.delete(profile);
}

export function observePwaInstallation(
  profile: PerfilApp,
  origin: string,
  installed: boolean,
  evidence: PwaInstallationEvidence["evidence"],
): PwaInstallationEvidence | null {
  if (typeof window === "undefined" || APP_PROFILES[profile].origin !== origin) return null;
  if (!installed && evidence !== "browser-query") return null;
  const previous = observed.get(profile);
  if (previous?.installed === installed && previous.evidence === evidence) return previous;
  const proof = { installed, evidence, observedAt: Date.now() };
  observed.set(profile, proof);
  try {
    window.localStorage.setItem(`pedetrem:installation-proof:${profile}:v1`, JSON.stringify(proof));
  } catch {
    // Evidence still works for this session when persistent storage is unavailable.
  }
  window.dispatchEvent(new Event(PWA_INSTALLATION_CHANGED));
  return proof;
}

export function pwaInstallationId(profile: PerfilApp): string | null {
  if (typeof window === "undefined") return null;
  if (deviceIds.has(profile)) return deviceIds.get(profile)!;
  const key = `pedetrem:pwa-device:${profile}:v1`;
  try {
    const saved = window.localStorage.getItem(key);
    if (
      saved &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(saved)
    ) {
      deviceIds.set(profile, saved);
      return saved;
    }
  } catch {
    // Retain a per-session ID without fingerprinting the device.
  }
  const id = globalThis.crypto?.randomUUID?.();
  if (!id) return null;
  deviceIds.set(profile, id);
  try {
    window.localStorage.setItem(key, id);
  } catch {
    /* Keep the session ID. */
  }
  return id;
}

export function pwaInvitePostponed(profile: PerfilApp, now = Date.now()): boolean {
  if (typeof window === "undefined") return false;
  let until = postponed.get(profile) ?? 0;
  try {
    const saved = Number(window.localStorage.getItem(`pedetrem:pwa-invite:${profile}:v1`));
    if (Number.isFinite(saved)) until = Math.max(until, saved);
  } catch {
    /* Use the session choice. */
  }
  return until > now;
}

export function postponePwaInvite(profile: PerfilApp, now = Date.now()): void {
  if (typeof window === "undefined") return;
  const until = now + INVITE_DELAY;
  postponed.set(profile, until);
  try {
    window.localStorage.setItem(`pedetrem:pwa-invite:${profile}:v1`, String(until));
  } catch {
    /* Keep the session choice. */
  }
}
