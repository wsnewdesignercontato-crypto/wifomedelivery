import { useEffect, useRef, useState } from "react";
import { APP_PROFILES, profileInstallUrl, type PerfilApp } from "@/lib/app-profiles";
import { useAppInstalado } from "@/hooks/use-app-instalado";
import { PUSH_SW_URL } from "@/lib/push-config";
import { androidNeedsChrome, chromeInstallUrl } from "@/lib/android-install";
import { isProfileInstallDocument } from "@/lib/install-document";
import { getInstallPrompt, takeInstallPrompt } from "@/lib/install-prompt";
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
  const [android, setAndroid] = useState(false);
  const [openChrome, setOpenChrome] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const requesting = useRef(false);
  const { instalado, evidence, revalidar } = useAppInstalado(perfilAtual);
  useEffect(() => {
    setIos(
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    );
    const isAndroid = /Android/i.test(navigator.userAgent);
    setAndroid(isAndroid);
    setOpenChrome(
      androidNeedsChrome({
        userAgent: navigator.userAgent,
        standalone: !!window.matchMedia?.("(display-mode: standalone)").matches,
        supportsPrompt: "onbeforeinstallprompt" in window,
        nativeReady: !!getInstallPrompt(perfilAtual),
      }),
    );
  }, [perfilAtual]);
  useEffect(() => {
    // Dismissal applies only to this visit. Always offer again on the next login visit.
    // This is our invitation; native prompts still require the matching install document.
    if (instalado || (android && !canPrompt && !openChrome)) return;
    const timer = window.setTimeout(() => {
      if (!requesting.current && !document.querySelector('[role="dialog"][data-state="open"]'))
        setInvite(true);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [perfilAtual, instalado, android, canPrompt, openChrome]);
  useEffect(() => {
    if (!preparing) return;
    const timer = window.setTimeout(() => {
      setPreparing(false);
      setStatusMessage("O navegador ainda não liberou a instalação. Tente novamente.");
    }, 45000);
    return () => window.clearTimeout(timer);
  }, [preparing]);
  const dismissInvite = () => {
    setInvite(false);
  };
  useEffect(() => {
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register(PUSH_SW_URL, { scope: "/" }).catch(() => {
        /* Manual installation remains available. */
      });
    const onPrompt = () => {
      if (!isProfileInstallDocument(perfilAtual)) return;
      const ready = !!getInstallPrompt(perfilAtual);
      setCanPrompt(ready);
      if (ready) {
        setPreparing(false);
        setStatusMessage(null);
        setOpenChrome(false);
      }
    };
    const onInstalled = () => {
      if (!isProfileInstallDocument(perfilAtual)) return;
      setCanPrompt(false);
      setPreparing(false);
      setStatusMessage(null);
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
    setInvite(false);
    if (openChrome) {
      window.location.assign(chromeInstallUrl(perfilAtual));
      return;
    }
    if (!isProfileInstallDocument(perfilAtual)) {
      window.location.assign(profileInstallUrl(perfilAtual));
      return;
    }
    const offer = takeInstallPrompt(perfilAtual);
    setCanPrompt(false);
    if (!offer) {
      if (android) {
        setPreparing(true);
        setStatusMessage("Preparando instalação no Android…");
        void revalidar();
      } else {
        setHelp(true);
      }
      return;
    }
    setPreparing(false);
    setStatusMessage(null);
    setBusy(true);
    requesting.current = true;
    try {
      await offer.prompt();
      await offer.userChoice;
      setCanPrompt(!!getInstallPrompt(perfilAtual));
      await revalidar();
    } catch {
      if (android) setStatusMessage("Não foi possível abrir a instalação. Tente novamente.");
      else setHelp(true);
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
        nativeReady={canPrompt}
        android={android}
        preparing={preparing}
        openChrome={openChrome}
        statusMessage={statusMessage}
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
            <DialogTitle>Instale {app.name}</DialogTitle>
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
            {openChrome
              ? "Abrir no Chrome"
              : ios
                ? "Ver instruções de instalação"
                : "Instalar aplicativo"}
          </Button>
          <Button variant="outline" onClick={dismissInvite}>
            Agora não
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={help && !android && !instalado} onOpenChange={setHelp}>
        <DialogContent className={app.theme}>
          <DialogHeader>
            <DialogTitle>Instalar {app.name}</DialogTitle>
            <DialogDescription>
              {canPrompt
                ? "A instalação está disponível. Toque em Instalar agora para confirmar no navegador."
                : "O navegador ainda não disponibilizou a janela de instalação. Você pode instalar pelo menu seguindo os passos abaixo."}
            </DialogDescription>
          </DialogHeader>
          <ol className="list-inside list-decimal space-y-3 text-sm">
            {ios ? (
              <li>
                Abra esta página no Safari, toque em <b>Compartilhar</b> e depois em{" "}
                <b>Adicionar à Tela de Início</b>.
              </li>
            ) : (
              <li>
                No Android, abra o menu de três pontos do Chrome e escolha{" "}
                <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b>. Confirme em{" "}
                <b>Instalar</b>.
              </li>
            )}
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
