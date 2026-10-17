import { Download } from "lucide-react";
import { APP_PROFILES, profileInstallUrl, type PerfilApp } from "@/lib/app-profiles";

type Props = {
  perfilAtual: PerfilApp;
  instalado: boolean;
  busy: boolean;
  onInstall: () => void;
};

export function AppDownloadOptions({ perfilAtual, instalado, busy, onInstall }: Props) {
  const app = APP_PROFILES[perfilAtual];
  return (
    <div className={app.theme} data-app-install-banner>
      {!instalado && (
        <div className="border-b border-primary/25 bg-card px-4 py-2">
          <button
            disabled={busy}
            type="button"
            onClick={onInstall}
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
              <Download className="h-4 w-4" /> Baixar
            </span>
          </button>
        </div>
      )}
      <nav
        aria-label="Outros aplicativos PedeTrem"
        className="border-b border-border bg-card px-4 py-2"
      >
        <div className="mx-auto max-w-7xl">
          <p className="mb-2 text-xs text-muted-foreground">
            Baixe também os outros apps no navegador:
          </p>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            {(Object.keys(APP_PROFILES) as PerfilApp[])
              .filter((profile) => profile !== perfilAtual)
              .map((profile) => {
                const other = APP_PROFILES[profile];
                return (
                  <a
                    key={profile}
                    href={profileInstallUrl(profile)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Baixar ${other.name}`}
                    className={`${other.theme} flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-primary/25 px-3 py-2 text-foreground transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
                  >
                    <img
                      src={other.icon}
                      alt=""
                      width={32}
                      height={32}
                      className="h-8 w-8 shrink-0 rounded-full"
                    />
                    <span className="min-w-0 flex-1 text-xs font-semibold">
                      {other.name.replace("PedeTrem ", "")}
                    </span>
                    <Download aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                  </a>
                );
              })}
          </div>
        </div>
      </nav>
    </div>
  );
}
