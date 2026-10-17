import { Download, LoaderCircle } from "lucide-react";
import { APP_PROFILES, type PerfilApp } from "@/lib/app-profiles";

type Props = {
  perfilAtual: PerfilApp;
  instalado: boolean;
  busy: boolean;
  nativeReady?: boolean;
  onInstall: () => void;
};

export function AppDownloadOptions({
  perfilAtual,
  instalado,
  busy,
  nativeReady,
  onInstall,
}: Props) {
  if (instalado) return null;
  const app = APP_PROFILES[perfilAtual];
  return (
    <div className={app.theme} data-app-install-banner>
      <div className="border-b border-primary/25 bg-card px-4 py-2">
        <button
          disabled={busy}
          type="button"
          onClick={onInstall}
          aria-label={`Baixar ${app.name}`}
          aria-busy={busy}
          className="mx-auto flex w-full max-w-7xl items-center gap-3 text-left disabled:cursor-wait"
        >
          <img src={app.icon} alt="" width={40} height={40} className="h-10 w-10 rounded-full" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-foreground">{app.name}</span>
            <span className="block text-xs text-muted-foreground">
              {busy
                ? "Confirme a instalação na janela do navegador"
                : nativeReady
                  ? app.description
                  : "Toque para ver como instalar no celular"}
            </span>
          </span>
          <span className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
            {busy ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {busy ? "Aguarde" : "Baixar"}
          </span>
        </button>
      </div>
    </div>
  );
}
