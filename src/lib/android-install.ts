import { profileInstallUrl, type PerfilApp } from "./app-profiles.ts";

/** Open this exact profile in Chrome using an explicit user click. */
export function chromeInstallUrl(profile: PerfilApp): string {
  const target = new URL(profileInstallUrl(profile));
  return (
    `intent://${target.host}${target.pathname}#Intent;scheme=https;package=com.android.chrome;` +
    `S.browser_fallback_url=${encodeURIComponent(target.href)};end`
  );
}

/** A browser tab can install; embedded browsers and app windows may need Chrome. */
export function androidNeedsChrome({
  userAgent,
  standalone,
  supportsPrompt,
  nativeReady,
}: {
  userAgent: string;
  standalone: boolean;
  supportsPrompt: boolean;
  nativeReady: boolean;
}): boolean {
  if (!/Android/i.test(userAgent) || nativeReady) return false;
  return standalone || /\bwv\b|FBAN|FBAV|Instagram/i.test(userAgent) || !supportsPrompt;
}
