/** Identify the code actually loaded, rather than using the first network check as baseline. */
export function appVersionFingerprint(html: string, origin: string): string | null {
  const scripts = new Set<string>();
  for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) {
    if (!/\btype\s*=\s*["']module["']/i.test(tag)) continue;
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src) continue;
    try {
      const url = new URL(src, origin);
      if (url.origin === origin && /^\/assets\/.+\.js$/.test(url.pathname))
        scripts.add(url.pathname);
    } catch {
      // Ignore malformed or unrelated script URLs.
    }
  }
  return [...scripts].sort().join("|") || null;
}

export async function fetchAppVersion(
  origin: string,
  request: typeof fetch = fetch,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await request(`${origin}/?app-update=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return null;
    if (response.url && new URL(response.url).origin !== origin) return null;
    return appVersionFingerprint(await response.text(), origin);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function createAppUpdateMonitor(
  loadedVersion: string | null,
  readVersion: () => Promise<string | null>,
  onAvailable: (version: string | null) => void,
  reload: () => void,
) {
  let stopped = false;
  let pending = false;
  let applying = false;
  let available: string | null = null;
  return {
    async check() {
      if (stopped || pending || applying || !loadedVersion) return;
      pending = true;
      try {
        const version = await readVersion();
        if (stopped || !version) return;
        const next = version === loadedVersion ? null : version;
        if (next !== available) {
          available = next;
          onAvailable(next);
        }
      } catch {
        // Offline or failed checks leave the current app usable.
      } finally {
        pending = false;
      }
    },
    apply() {
      if (stopped || applying || !available) return false;
      applying = true;
      reload();
      return true;
    },
    stop() {
      stopped = true;
    },
  };
}
