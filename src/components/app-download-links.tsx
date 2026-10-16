import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { APP_PROFILES, type PerfilApp } from "@/lib/app-profiles";
import { useAppInstalado } from "@/hooks/use-app-instalado";
import { PUSH_SW_URL } from "@/lib/push-config";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
export function AppDownloadLinks({ perfilAtual = "cliente" }: { perfilAtual?: PerfilApp }) {
  const app = APP_PROFILES[perfilAtual];
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const { instalado, revalidar } = useAppInstalado(perfilAtual);
  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    link.href = app.manifest;
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register(PUSH_SW_URL, { scope: "/" }).catch(() => {
        /* Manual installation remains available. */
      });
    for (const [name, content] of [
      ["apple-mobile-web-app-title", app.shortName],
      ["theme-color", app.color],
    ]) {
      let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = name;
        document.head.appendChild(meta);
      }
      meta.content = content;
    }
    const apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (apple) apple.href = app.icon;
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) icon.href = app.icon;
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setHelp(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [app]);
  async function install() {
    if (busy) return;
    if (!deferred) {
      setHelp(true);
      return;
    }
    setBusy(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      await revalidar();
    } catch {
      setHelp(true);
      setDeferred(null);
    } finally {
      setBusy(false);
    }
  }
  if (instalado) return null;
  return (
    <div className={app.theme} data-app-install-banner>
      <div className="border-b border-primary/25 bg-card px-4 py-2">
        <button
          disabled={busy}
          type="button"
          onClick={() => void install()}
          aria-label={`Baixar ${app.name}`}
          className="mx-auto flex w-full max-w-7xl items-center gap-3 text-left"
        >
          <img
            src={app.icon}
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 rounded-full object-contain"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-foreground">{app.name}</span>
            <span className="block text-xs text-muted-foreground">{app.description}</span>
          </span>
          <span className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
            <Download className="h-4 w-4" />
            Baixar
          </span>
        </button>
      </div>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className={app.theme}>
          <DialogHeader>
            <DialogTitle>Instalar {app.name}</DialogTitle>
            <DialogDescription>
              Este aplicativo tem ícone e acesso próprios. Você pode instalar também os outros
              perfis no mesmo celular.
            </DialogDescription>
          </DialogHeader>
          <ol className="list-inside list-decimal space-y-3 text-sm">
            <li>
              No Android, abra o menu do Chrome e escolha <b>Instalar aplicativo</b> ou{" "}
              <b>Adicionar à tela inicial</b>.
            </li>
            <li>
              No iPhone, abra esta página no Safari, toque em <b>Compartilhar</b> e depois em{" "}
              <b>Adicionar à Tela de Início</b>.
            </li>
            <li>
              Confira o nome <b>{app.shortName}</b> e a cor do ícone antes de adicionar.
            </li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Se já instalou, abra pelo ícone da tela inicial. Alguns navegadores não informam ao site
            se o aplicativo está instalado.
          </p>
          <Button onClick={() => setHelp(false)}>Entendi</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
