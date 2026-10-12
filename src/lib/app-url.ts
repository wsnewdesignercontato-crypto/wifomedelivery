export function resolveAppUrl(config: { appUrl?: string; vercelUrl?: string }): string {
  const appUrl = config.appUrl?.trim();
  const vercelUrl = config.vercelUrl?.trim();
  if (!appUrl && !vercelUrl) return "http://localhost:3000";
  try {
    const url = new URL(appUrl || `https://${vercelUrl}`);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (!appUrl && url.host !== vercelUrl)
    ) {
      throw new Error();
    }
    return url.origin;
  } catch {
    throw new Error("URL do aplicativo inválida. Configure uma origem HTTP ou HTTPS.");
  }
}
