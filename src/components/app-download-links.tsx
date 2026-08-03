import { useEffect, useState } from "react";
import { ShoppingBag, Store, Bike, Download, Share, Plus, Smartphone, X } from "lucide-react";
import { useAppInstalado } from "@/hooks/use-app-instalado";

type Perfil = "cliente" | "estabelecimento" | "entregador";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const apps: Record<
  Perfil,
  {
    nome: string;
    legenda: string;
    manifest: string;
    /** Nome curto que aparece embaixo do ícone na tela inicial (evita corte). */
    nomeTela: string;
    Icon: typeof ShoppingBag;
    theme: string;
  }
> = {
  cliente: {
    nome: "WiFome Cliente",
    legenda: "Peça e acompanhe pelo app",
    manifest: "/manifest-cliente.webmanifest?v=2",
    nomeTela: "WiFome",
    Icon: ShoppingBag,
    theme: "theme-cliente",
  },
  estabelecimento: {
    nome: "WiFome Estabelecimento",
    legenda: "Gerencie pedidos pelo app",
    manifest: "/manifest-estabelecimento.webmanifest?v=2",
    nomeTela: "WiLoja",
    Icon: Store,
    theme: "theme-estab",
  },
  entregador: {
    nome: "WiFome Entregador",
    legenda: "Receba corridas pelo app",
    manifest: "/manifest-entregador.webmanifest?v=2",
    nomeTela: "WiMoto",
    Icon: Bike,
    theme: "theme-entregador",
  },
};

function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
}

/**
 * Barra fina de instalação do app do perfil atual, exibida no topo das telas de acesso.
 * Some automaticamente depois que a pessoa instala o aplicativo.
 */
export function AppDownloadLinks({ perfilAtual = "cliente" }: { perfilAtual?: Perfil }) {
  const app = apps[perfilAtual];
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [ajuda, setAjuda] = useState(false);
  const { instalado, revalidar, confirmarInstalado } = useAppInstalado(perfilAtual);
  const visivel = !instalado;

  // Aponta o manifest e o nome de tela inicial (iOS) do perfil atual assim que
  // a tela de acesso abre — evita que o rótulo do ícone saia cortado/errado.
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    link?.setAttribute("href", apps[perfilAtual].manifest);

    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="apple-mobile-web-app-title"]',
    );
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "apple-mobile-web-app-title");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", apps[perfilAtual].nomeTela);
  }, [perfilAtual]);

  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {
      confirmarInstalado();
      setAjuda(false);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [perfilAtual, confirmarInstalado]);

  async function baixar() {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    link?.setAttribute("href", app.manifest);

    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      setDeferred(null);
      if (outcome === "accepted") {
        confirmarInstalado();
      } else {
        void revalidar();
      }
      return;
    }
    setAjuda(true);
  }

  function confirmarInstalacao() {
    confirmarInstalado();
    setAjuda(false);
  }

  if (!visivel) return null;

  return (
    <>
      <button
        type="button"
        onClick={baixar}
        aria-label={`Baixar ${app.nome}`}
        className="tap-target flex w-full items-center gap-2.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-left transition-colors hover:border-primary/70"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <app.Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-xs font-bold text-foreground">{app.nome}</span>
          <span className="block truncate text-[10px] text-muted-foreground">{app.legenda}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">
          <Download className="h-3 w-3" />
          Baixar
        </span>
      </button>

      {ajuda && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setAjuda(false)}
        >
          <div className={app.theme} onClick={(e) => e.stopPropagation()}>
            <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-xl">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 shrink-0 text-primary" />
                <h3 className="min-w-0 flex-1 truncate text-base font-bold text-foreground">
                  Instalar {app.nome}
                </h3>
                <button
                  type="button"
                  aria-label="Fechar"
                  onClick={() => setAjuda(false)}
                  className="tap-target shrink-0 text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ol className="mt-4 space-y-3 text-sm text-foreground">
                <li className="flex items-start gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                    1
                  </span>
                  <span>
                    {isIOS() ? (
                      <>
                        Toque em{" "}
                        <Share className="mx-1 inline h-4 w-4 align-text-bottom text-primary" />
                        <span className="font-medium">Compartilhar</span> na barra do Safari.
                      </>
                    ) : (
                      <>
                        Abra o menu do navegador (⋮) e escolha{" "}
                        <span className="font-medium">Instalar aplicativo</span>.
                      </>
                    )}
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                    2
                  </span>
                  <span>
                    Escolha{" "}
                    <span className="font-medium">
                      Adicionar à Tela de Início
                      <Plus className="mx-1 inline h-4 w-4 align-text-bottom text-primary" />
                    </span>
                    .
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                    3
                  </span>
                  <span>Confirme — o {app.nome} fica na sua tela inicial.</span>
                </li>
              </ol>
              <button
                type="button"
                onClick={confirmarInstalacao}
                className="tap-target mt-6 min-h-[44px] w-full rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-brand"
              >
                Já instalei
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
