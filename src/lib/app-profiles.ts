export type PerfilApp = "cliente" | "estabelecimento" | "entregador";
export const APP_PROFILES = {
  cliente: {
    origin: "https://pedetrem.vercel.app",
    name: "PedeTrem Cliente",
    shortName: "PT Cliente",
    id: "/wifome-cliente",
    manifest: "/manifest-cliente.webmanifest",
    icon: "/icons/cliente-any-512-v2.png",
    appleIcon: "/icons/cliente-apple-v2.png",
    scope: "/cliente",
    loginPath: "/cliente/entrar",
    color: "#E10B17",
    theme: "theme-cliente",
    description: "Peça e acompanhe pelo app",
  },
  estabelecimento: {
    origin: "https://pedetrem-loja.vercel.app",
    name: "PedeTrem Estabelecimento",
    shortName: "PT Loja",
    id: "/wifome-estabelecimento",
    manifest: "/manifest-estabelecimento.webmanifest",
    icon: "/icons/estabelecimento-any-512-v2.png",
    appleIcon: "/icons/estabelecimento-apple-v2.png",
    scope: "/estabelecimento",
    loginPath: "/estabelecimento/entrar",
    color: "#F58206",
    theme: "theme-estab",
    description: "Gerencie sua loja pelo app",
  },
  entregador: {
    origin: "https://pedetrem-entregador.vercel.app",
    name: "PedeTrem Entregador",
    shortName: "PT Entrega",
    id: "/wifome-entregador",
    manifest: "/manifest-entregador.webmanifest",
    icon: "/icons/entregador-any-512-v2.png",
    appleIcon: "/icons/entregador-apple-v2.png",
    scope: "/entregador",
    loginPath: "/entregador/entrar",
    color: "#07883B",
    theme: "theme-entregador",
    description: "Receba corridas pelo app",
  },
} as const;
export function profileInstallUrl(profile: PerfilApp): string {
  const app = APP_PROFILES[profile];
  return new URL(app.loginPath, app.origin).href;
}
export function isProfileLoginPath(pathname: string): boolean {
  return Object.values(APP_PROFILES).some((app) => app.loginPath === pathname.replace(/\/$/, ""));
}
export function isAppProfile(value: unknown): value is PerfilApp {
  return value === "cliente" || value === "estabelecimento" || value === "entregador";
}
export function appProfileFromUrl(pathname: string, search: string): PerfilApp {
  if (/^\/estabelecimento(?:\/|$)/.test(pathname)) return "estabelecimento";
  if (/^\/entregador(?:\/|$)/.test(pathname)) return "entregador";
  if (pathname === "/auth" || pathname === "/app") {
    const value = new URLSearchParams(search).get("perfil");
    if (isAppProfile(value)) return value;
  }
  return "cliente";
}
export function relatedAppMatches(
  app: { platform?: string; id?: string; url?: string },
  profile: PerfilApp,
  origin: string,
): boolean {
  if (app.platform !== "webapp") return false;
  const target = APP_PROFILES[profile];
  return [app.id, app.url].some((value) => {
    if (!value) return false;
    try {
      const url = new URL(value, origin);
      return (
        url.origin === origin && (url.pathname === target.id || url.pathname === target.manifest)
      );
    } catch {
      return false;
    }
  });
}
export async function systemInstallationEvidence(
  profile: PerfilApp,
  origin: string,
  runningProfile: PerfilApp | null,
  query?: () => Promise<Array<{ platform?: string; id?: string; url?: string }>>,
): Promise<boolean | null> {
  if (runningProfile === profile) return true;
  if (!query) return null;
  try {
    return (await query()).some((app) => relatedAppMatches(app, profile, origin));
  } catch {
    return null;
  }
}
