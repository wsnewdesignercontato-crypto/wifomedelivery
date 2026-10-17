import { useEffect, useState } from "react";
import { APP_PROFILES, profileInstallUrl, type PerfilApp } from "@/lib/app-profiles";
import { useAppInstalado } from "@/hooks/use-app-instalado";
import { PUSH_SW_URL } from "@/lib/push-config";
import { isProfileInstallDocument } from "@/lib/install-document";
import { getInstallPrompt, clearInstallPrompt, type InstallEvent } from "@/lib/install-prompt";
import { Button } from "@/components/ui/button";
import { AppDownloadOptions } from "@/components/app-download-options";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function AppDownloadLinks({ perfilAtual = "cliente" }: { perfilAtual?: PerfilApp }) {
  const app = APP_PROFILES[perfilAtual];
  const [deferred, setDeferred] = useState<InstallEvent | null>(() =>
    getInstallPrompt(perfilAtual),
  );
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const { instalado, revalidar } = useAppInstalado(perfilAtual);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register(PUSH_SW_URL, { scope: "/" }).catch(() => {
        /* Manual installation remains available. */
      });
    const onPrompt = (event: Event) => {
      event.preventDefault();
      if (!isProfileInstallDocument(perfilAtual)) return;
      setDeferred(event as InstallEvent);
    };
    const onInstalled = () => {
      if (!isProfileInstallDocument(perfilAtual)) return;
      setDeferred(null);
      setHelp(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    setDeferred(getInstallPrompt(perfilAtual));
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [perfilAtual]);
  async function install() {
    if (busy) return;
    if (!isProfileInstallDocument(perfilAtual)) {
      window.location.assign(profileInstallUrl(perfilAtual));
      return;
    }
    const offer = deferred ?? getInstallPrompt(perfilAtual);
    if (!offer) {
      setHelp(true);
      return;
    }
    setBusy(true);
    try {
      await offer.prompt();
      await offer.userChoice;
      clearInstallPrompt();
      setDeferred(null);
      await revalidar();
    } catch {
      setHelp(true);
      setDeferred(null);
      clearInstallPrompt();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <AppDownloadOptions
        perfilAtual={perfilAtual}
        instalado={instalado}
        busy={busy}
        onInstall={() => void install()}
      />
      <Dialog open={help && !instalado} onOpenChange={setHelp}>
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
          <p className="text-xs text-muted-foreground">
            Para instalar outro perfil, abra o link correspondente no navegador do celular, fora do
            aplicativo já instalado.
          </p>
          <Button asChild variant="outline">
            <a href={profileInstallUrl(perfilAtual)} target="_blank" rel="noopener noreferrer">
              Abrir no navegador
            </a>
          </Button>
          {deferred && (
            <Button disabled={busy} onClick={() => void install()}>
              Instalar agora
            </Button>
          )}
          <Button variant="outline" onClick={() => setHelp(false)}>
            Entendi
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
