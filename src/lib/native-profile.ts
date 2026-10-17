import { APP_PROFILES, isAppProfile, type PerfilApp } from "./app-profiles.ts";

// Presentation hint only: this must never grant roles, permissions or backend access.
export function nativeAppProfile(userAgent: string, origin: string): PerfilApp | null {
  const profile = userAgent.match(
    /(?:^|\s)PedeTremNative\/(cliente|estabelecimento|entregador)(?=\s|$)/,
  )?.[1];
  return isAppProfile(profile) && APP_PROFILES[profile].origin === origin ? profile : null;
}
