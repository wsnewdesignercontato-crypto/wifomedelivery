import { useEffect, useState } from "react";
import { ShoppingBag, Store, Bike, Download, Share, Plus, Smartphone } from "lucide-react";

type Perfil = "cliente" | "estabelecimento" | "entregador";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const apps: {
  perfil: Perfil;
  nome: string;
  legenda: string;
  manifest: string;
  Icon: typeof ShoppingBag;
  theme: string;
}[] = [
  {
    perfil: "cliente",
    nome: "Cliente",
    legenda: "Peça e acompanhe",
    manifest: "/manifest-cliente.webmanifest",
    Icon: ShoppingBag,
    theme: "theme-cliente",
  },
  {
    perfil: "estabelecimento",
    nome: "Estabelecimento",
    legenda: "Gerencie pedidos",
    manifest: "/manifest-estabelecimento.webmanifest",
    Icon: Store,
    theme: "theme-estab",
  },
  {
    perfil: "entregador",
    nome: "Entregador",
    legenda: "Faça entregas",
    manifest: "/manifest-entregador.webmanifest",
    Icon: Bike,
    theme: "theme-entregador",
  },
];

function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
}

/**
 * Barra de download dos 3 aplicativos, exibida nas telas de acesso.
 * Quem chega pelo link do navegador consegue instalar o app do seu perfil.
 */
export function AppDownloadLinks({ perfilAtual }: { perfilAtual?: Perfil }) {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [ajuda, setAjuda] = useState<Perfil | null>(null);

  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  async function baixar(app: (typeof apps)[number]) {
    // Aponta o manifest para o app escolhido antes de abrir o prompt
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    link?.setAttribute("href", app.manifest);

    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      return;
    }
    setAjuda(app.perfil);
  }

  const appAjuda = apps.find((a) => a.perfil === ajuda);

  return (
    <section className="mt-8" aria-label="Baixar o aplicativo">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Baixe o aplicativo
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {apps.map((app) => {
          const ativo = app.perfil === perfilAtual;
          return (
            <button
              key={app.perfil}
              type="button"
              onClick={() => baixar(app)}
              className={`${app.theme} tap-target group grid min-h-[56px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 sm:grid-cols-1 sm:justify-items-center sm:gap-1.5 sm:py-4 sm:text-center ${
                ativo
                  ? "border-primary/60 bg-primary/10 shadow-brand"
                  : "border-border bg-card hover:border-primary/50"
              }`}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                <app.Icon className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0 sm:text-center">
                <span className="block truncate text-sm font-bold text-foreground">
                  {app.nome}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {app.legenda}
                </span>
              </span>
              <Download className="h-4 w-4 shrink-0 text-primary sm:hidden" />
            </button>
          );
        })}
      </div>

      {appAjuda && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setAjuda(null)}
        >
          <div className={appAjuda.theme} onClick={(e) => e.stopPropagation()}>
            <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-xl">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 shrink-0 text-primary" />
                <h3 className="min-w-0 truncate text-base font-bold text-foreground">
                  Instalar WiFome {appAjuda.nome}
                </h3>
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
                  <span>
                    Confirme — o app WiFome {appAjuda.nome} fica na sua tela inicial.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setAjuda(null)}
                className="tap-target mt-6 min-h-[44px] w-full rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-brand"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
