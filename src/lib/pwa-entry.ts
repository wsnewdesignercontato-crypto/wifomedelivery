import { APP_PROFILES, appProfileFromUrl } from "./app-profiles.ts";

const managedHosts = new Set(Object.values(APP_PROFILES).map((app) => new URL(app.origin).host));

/** Never serve an installable profile document under another production app's origin. */
export function independentAppRedirect(request: Request): string | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  if (!managedHosts.has(url.host)) return null;
  if (/^\/entrega(?:\/|$)/.test(url.pathname)) {
    url.pathname = url.pathname.replace(/^\/entrega(?=\/|$)/, "/entregador");
    return APP_PROFILES.entregador.origin + url.pathname + url.search;
  }
  const rolePath = /^\/(?:cliente|estabelecimento|entregador)(?:\/|$)/.test(url.pathname);
  if (!rolePath && url.pathname !== "/auth" && url.pathname !== "/app") return null;
  const profile = appProfileFromUrl(url.pathname, url.search);
  const expected = APP_PROFILES[profile].origin;
  // Nitro may receive an internal HTTP URL behind Vercel's HTTPS proxy.
  return url.host === new URL(expected).host ? null : expected + url.pathname + url.search;
}
