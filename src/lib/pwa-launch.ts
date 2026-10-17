import { APP_PROFILES, isAppProfile, type PerfilApp } from "./app-profiles.ts";

// Old values were inferred from the current page, not an actual app launch.
export const RUNNING_APP_KEY = "pedetrem:running-app:v2";

/** Standalone describes the window; only a matching launch identifies its app. */
export function runningAppProfile({
  standalone,
  origin,
  search,
  savedProfile,
}: {
  standalone: boolean;
  origin: string;
  search: string;
  savedProfile: unknown;
}): PerfilApp | null {
  if (!standalone) return null;
  const launched = new URLSearchParams(search).get("app");
  const profile = launched === null ? savedProfile : launched;
  if (!isAppProfile(profile) || APP_PROFILES[profile].origin !== origin) return null;
  return profile;
}
