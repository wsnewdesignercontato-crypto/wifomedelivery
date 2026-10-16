export type PerfilApp = "cliente" | "estabelecimento" | "entregador";
export const APP_PROFILES = {
  cliente: {
    name: "PedeTrem Cliente",
    shortName: "PT Cliente",
    id: "/wifome-cliente",
    manifest: "/manifest-cliente.webmanifest",
    icon: "/pedetrem-icon-512.png",
    color: "#E10B17",
    theme: "theme-cliente",
    description: "Peça e acompanhe pelo app",
  },
  estabelecimento: {
    name: "PedeTrem Estabelecimento",
    shortName: "PT Loja",
    id: "/wifome-estabelecimento",
    manifest: "/manifest-estabelecimento.webmanifest",
    icon: "/pedetrem-estabelecimento.png",
    color: "#F58206",
    theme: "theme-estab",
    description: "Gerencie sua loja pelo app",
  },
  entregador: {
    name: "PedeTrem Entregador",
    shortName: "PT Entrega",
    id: "/wifome-entregador",
    manifest: "/manifest-entregador.webmanifest",
    icon: "/pedetrem-entregador.png",
    color: "#07883B",
    theme: "theme-entregador",
    description: "Receba corridas pelo app",
  },
} as const;
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
