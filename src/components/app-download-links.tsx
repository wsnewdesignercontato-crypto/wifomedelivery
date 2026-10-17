import { useEffect, useRef, useState } from "react";
import { APP_PROFILES, profileInstallUrl, type PerfilApp } from "@/lib/app-profiles";
import { useAppInstalado } from "@/hooks/use-app-instalado";
import { PUSH_SW_URL } from "@/lib/push-config";
import { isProfileInstallDocument } from "@/lib/install-document";
import { getInstallPrompt, takeInstallPrompt } from "@/lib/install-prompt";
import { postponePwaInvite, pwaInvitePostponed } from "@/lib/pwa-installation";
import { Button } from "@/components/ui/button";
import { AppDownloadOptions } from "@/components/app-download-options";
import { PwaInstallSync } from "@/components/pwa-install-sync";
import { IFomeLogo } from "@/components/ifome-logo";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function AppDownloadLinks({ perfilAtual = "cliente" }: { perfilAtual?: PerfilApp }) {
  const app = APP_PROFILES[perfilAtual];
  const [canPrompt, setCanPrompt] = useState(() => !!getInstallPrompt(perfilAtual));
  const [invite, setInvite] = useState(false);
  const [ios, setIos] = useState(false);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const requesting = useRef(false);
  const { instalado, evidence, revalidar } = useAppInstalado(perfilAtual);
  useEffect(() => {
    setIos(
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    );
    if (instalado || !isProfileInstallDocument(perfilAtual) || pwaInvitePostponed(perfilAtual))
      return;
    const timer = window.setTimeout(() => {
      if (
        !pwaInvitePostponed(perfilAtual) &&
        !document.querySelector('[role="dialog"][data-state="open"]')
      )
        setInvite(true);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [perfilAtual, instalado]);
  const dismissInvite = () => {
    postponePwaInvite(perfilAtual);
    setInvite(false);
  };
  useEffect(() => {
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register(PUSH_SW_URL, { scope: "/" }).catch(() => {
        /* Manual installation remains available. */
      });
    const onPrompt = () => {
      if (!isProfileInstallDocument(perfilAtual)) return;
      setCanPrompt(!!getInstallPrompt(perfilAtual));
    };
    const onInstalled = () => {
      if (!isProfileInstallDocument(perfilAtual)) return;
      setCanPrompt(false);
      setHelp(false);
      setInvite(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    setCanPrompt(!!getInstallPrompt(perfilAtual));
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [perfilAtual]);
  async function install() {
    if (requesting.current) return;
    dismissInvite();
    if (!isProfileInstallDocument(perfilAtual)) {
      window.location.assign(profileInstallUrl(perfilAtual));
      return;
    }
    const offer = takeInstallPrompt(perfilAtual);
    setCanPrompt(false);
    if (!offer) {
      setHelp(true);
      return;
    }
    setBusy(true);
    requesting.current = true;
    try {
      await offer.prompt();
      await offer.userChoice;
      setCanPrompt(!!getInstallPrompt(perfilAtual));
      await revalidar();
    } catch {
      setHelp(true);
      setCanPrompt(!!getInstallPrompt(perfilAtual));
    } finally {
      setBusy(false);
      requesting.current = false;
    }
  }
  return (
    <>
      <PwaInstallSync profile={perfilAtual} evidence={evidence} />
      <AppDownloadOptions
        perfilAtual={perfilAtual}
        instalado={instalado}
        busy={busy}
        onInstall={() => void install()}
      />
      <Dialog
        open={invite && !instalado && !help}
        onOpenChange={(open) => {
          if (!open) dismissInvite();
        }}
      >
        <DialogContent className={`${app.theme} max-w-sm`}>
          <div className="flex justify-center">
            <IFomeLogo perfil={perfilAtual} size="md" showWord={false} />
          </div>
          <DialogHeader>
            <DialogTitle>Instale o PedeTrem</DialogTitle>
            <DialogDescription>
              Instale o PedeTrem no seu celular para ter acesso mais rápido. Este é o aplicativo de{" "}
              {perfilAtual === "cliente"
                ? "Cliente"
                : perfilAtual === "estabelecimento"
                  ? "Estabelecimento"
                  : "Entrega"}
              .
            </DialogDescription>
          </DialogHeader>
          {ios && (
            <p className="text-sm text-muted-foreground">
              No iPhone ou iPad, toque em Compartilhar e depois em Adicionar à Tela de Início.
            </p>
          )}
          <Button disabled={busy} onClick={() => void install()}>
            {ios ? "Ver instruções de instalação" : "Instalar aplicativo"}
          </Button>
          <Button variant="outline" onClick={dismissInvite}>
            Agora não
          </Button>
        </DialogContent>
      </Dialog>
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
          {canPrompt && (
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
