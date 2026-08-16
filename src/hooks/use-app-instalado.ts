import { useCallback, useEffect, useState } from "react";

export type PerfilApp = "cliente" | "estabelecimento" | "entregador";

type NavigatorWithInstallSignals = Navigator & {
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<Array<{ platform?: string; url?: string; id?: string }>>;
};

export const manifestPerfil: Record<PerfilApp, string> = {
  cliente: "/manifest-cliente.webmanifest?v=2",
  estabelecimento: "/manifest-estabelecimento.webmanifest?v=2",
  entregador: "/manifest-entregador.webmanifest?v=2",
};

export function instaladoKey(perfil: PerfilApp) {
  return `wifome:app-instalado:${perfil}`;
}

export function marcarInstalado(perfil: PerfilApp) {
  try {
    window.localStorage.setItem(instaladoKey(perfil), "1");
  } catch {
    /* ignore */
  }
}

/** Perfil do app que está rodando agora instalado (standalone/TWA), se houver. */
export function perfilInstaladoEmExecucao(): PerfilApp | null {
  if (typeof window === "undefined") return null;

  const browserNavigator = window.navigator as NavigatorWithInstallSignals;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    browserNavigator.standalone === true ||
    document.referrer.includes("android-app://");

  if (!standalone) return null;

  const busca = window.location.search.toLowerCase();
  const caminho = window.location.pathname.toLowerCase();
  if (busca.includes("perfil=estabelecimento") || caminho.startsWith("/estabelecimento")) {
    return "estabelecimento";
  }
  if (busca.includes("perfil=entregador") || caminho.startsWith("/entregador")) {
    return "entregador";
  }
  return "cliente";
}

/** Leitura síncrona: este perfil específico já foi instalado? */
export function lerInstalado(perfil: PerfilApp) {
  if (typeof window === "undefined") return false;

  const emExecucao = perfilInstaladoEmExecucao();
  if (emExecucao) {
    marcarInstalado(emExecucao);
    if (emExecucao === perfil) return true;
  }

  try {
    return window.localStorage.getItem(instaladoKey(perfil)) === "1";
  } catch {
    return false;
  }
}

/** Consulta o sistema (Android/Chrome) para saber se o app deste perfil está instalado. */
async function checarNoSistema(perfil: PerfilApp): Promise<boolean> {
  const api = (navigator as NavigatorWithInstallSignals).getInstalledRelatedApps;
  if (typeof api !== "function") return false;
  try {
    const apps: Array<{ platform?: string; url?: string; id?: string }> = await api.call(navigator);
    const alvo = manifestPerfil[perfil].split("?")[0];
    return apps.some((a) => (a.url ?? a.id ?? "").includes(alvo));
  } catch {
    return false;
  }
}

/**
 * Estado de instalação do app de um perfil, revalidado automaticamente:
 * ao instalar, ao voltar para a aba, ao mudar o display-mode e por sondagem curta
 * enquanto o usuário conclui a instalação em outra tela do sistema.
 */
export function useAppInstalado(perfil: PerfilApp) {
  const [instalado, setInstalado] = useState(false);

  const revalidar = useCallback(async () => {
    if (lerInstalado(perfil)) {
      setInstalado(true);
      return true;
    }
    const noSistema = await checarNoSistema(perfil);
    if (noSistema) {
      marcarInstalado(perfil);
      setInstalado(true);
      return true;
    }
    setInstalado(false);
    return false;
  }, [perfil]);

  useEffect(() => {
    let ativo = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const parar = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const rodar = async () => {
      const ok = await revalidar();
      if (!ativo) return;
      if (ok) parar();
    };

    void rodar();
    timer = setInterval(rodar, 3000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") void rodar();
    };
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === instaladoKey(perfil)) void rodar();
    };
    const onInstalled = () => {
      marcarInstalado(perfil);
      setInstalado(true);
      parar();
    };

    const mq = window.matchMedia?.("(display-mode: standalone)");
    mq?.addEventListener?.("change", onVisibility);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    window.addEventListener("storage", onStorage);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      ativo = false;
      parar();
      mq?.removeEventListener?.("change", onVisibility);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [perfil, revalidar]);

  const confirmarInstalado = useCallback(() => {
    marcarInstalado(perfil);
    setInstalado(true);
  }, [perfil]);

  return { instalado, revalidar, confirmarInstalado };
}
