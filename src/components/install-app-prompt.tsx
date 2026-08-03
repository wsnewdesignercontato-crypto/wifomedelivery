import { useEffect, useRef, useState } from "react";
import { Download, Share, Plus, X, Smartphone } from "lucide-react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Perfil = "cliente" | "estabelecimento" | "entregador";

const perfilApp: Record<Perfil, { nome: string; manifest: string; descricao: string }> = {
  cliente: {
    nome: "WiFome Cliente",
    manifest: "/manifest-cliente.webmanifest",
    descricao: "Peça e acompanhe suas entregas direto da tela inicial.",
  },
  estabelecimento: {
    nome: "WiFome Estabelecimento",
    manifest: "/manifest-estabelecimento.webmanifest",
    descricao: "Receba pedidos com alerta sonoro e gerencie sua loja como um app.",
  },
  entregador: {
    nome: "WiFome Entregador",
    manifest: "/manifest-entregador.webmanifest",
    descricao: "Receba corridas na tela e acompanhe seus ganhos como um app.",
  },
};

function detectPerfilFromUrl(): Perfil {
  if (typeof window === "undefined") return "cliente";
  const path = window.location.pathname.toLowerCase();
  const search = window.location.search.toLowerCase();

  if (path.startsWith("/estabelecimento") || search.includes("perfil=estabelecimento")) {
    return "estabelecimento";
  }
  if (path.startsWith("/entregador") || search.includes("perfil=entregador")) {
    return "entregador";
  }
  return "cliente";
}

const DISMISS_KEY = "wifome_install_dismissed_at";
const DISMISS_DAYS = 7;

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // @ts-expect-error iOS Safari
    window.navigator.standalone === true
  );
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
}

function recentlyDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function InstallAppPrompt({ perfil }: { perfil?: Perfil } = {}) {
  const perfilAtivo = perfil ?? detectPerfilFromUrl();
  const app = perfilApp[perfilAtivo];
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);


  // Aponta o manifest para o app do perfil atual
  useEffect(() => {
    if (typeof document === "undefined") return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;
    const original = link.getAttribute("href");
    link.setAttribute("href", app.manifest);
    return () => {
      if (original) link.setAttribute("href", original);
    };
  }, [app.manifest]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (recentlyDismissed()) return;
    setVisible(true);

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    // iOS não dispara beforeinstallprompt — mostra ajuda manual
    if (isIOS()) setVisible(true);

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
      try {
        localStorage.removeItem(DISMISS_KEY);
      } catch {}
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
  }

  async function install() {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") {
        setVisible(false);
      } else {
        dismiss();
      }
      setDeferred(null);
      return;
    }
    setShowIOSHelp(true);
  }

  // Reserva espaço no fim da página para o banner não cobrir conteúdo
  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = cardRef.current;
    if (!visible || !el) {
      document.documentElement.style.removeProperty("--install-banner-space");
      return;
    }
    const update = () => {
      document.documentElement.style.setProperty(
        "--install-banner-space",
        `${Math.ceil(el.getBoundingClientRect().height) + 16}px`,
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--install-banner-space");
    };
  }, [visible]);

  if (!visible) return null;

  const themeClass =
    perfilAtivo === "estabelecimento" ? "theme-estab" : perfilAtivo === "entregador" ? "theme-entregador" : "";

  return (
    <>
      <div
        className={`${themeClass} pointer-events-none fixed inset-x-0 bottom-0 z-[60] mx-auto w-full max-w-lg px-3 pb-[calc(env(safe-area-inset-bottom)+5rem)] md:pb-[calc(env(safe-area-inset-bottom)+0.75rem)] isolate`}
      >
        <div ref={cardRef} className="pointer-events-auto rounded-2xl border border-primary/30 bg-card/95 p-4 shadow-xl backdrop-blur">
          <div className="flex items-start gap-3">

            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-brand">
              <Smartphone className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-foreground">Instalar o app {app.nome}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{app.descricao}</p>
                </div>
                <button
                  onClick={dismiss}
                  aria-label="Fechar"
                  className="tap-target -m-1 shrink-0 p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <button
                onClick={install}
                className="tap-target mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground shadow-brand transition-transform hover:scale-[1.02] active:scale-95"
              >
                <Download className="h-3.5 w-3.5" />
                {isIOS() && !deferred ? "Como instalar no iPhone" : "Instalar agora"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showIOSHelp && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setShowIOSHelp(false)}
        >
          <div
            className={themeClass}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-xl">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-primary" />
                <h3 className="text-base font-bold text-foreground">Instalar {app.nome}</h3>
              </div>
              <ol className="mt-4 space-y-3 text-sm text-foreground">
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                    1
                  </span>
                  <span>
                    Toque no ícone{" "}
                    <Share className="mx-1 inline h-4 w-4 align-text-bottom text-primary" />{" "}
                    <span className="font-medium">Compartilhar</span> na barra do Safari.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                    2
                  </span>
                  <span>
                    Escolha{" "}
                    <span className="font-medium">
                      Adicionar à Tela de Início{" "}
                      <Plus className="mx-1 inline h-4 w-4 align-text-bottom text-primary" />
                    </span>
                    .
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                    3
                  </span>
                  <span>
                    Toque em <span className="font-medium">Adicionar</span> — o {app.nome} fica na sua tela como um app.
                  </span>
                </li>
              </ol>
              <button
                onClick={() => setShowIOSHelp(false)}
                className="mt-6 w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-brand"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
