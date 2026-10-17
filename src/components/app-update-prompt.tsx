import { useEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Download, Loader2 } from "lucide-react";
import { APP_PROFILES, appProfileFromUrl, type PerfilApp } from "@/lib/app-profiles";
import { appVersionFingerprint, createAppUpdateMonitor, fetchAppVersion } from "@/lib/app-update";
import { useDevicePreferences } from "@/hooks/use-device-preferences";
import { IFomeLogo } from "@/components/ifome-logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function AppUpdatePrompt() {
  const { prefs } = useDevicePreferences();
  const location = useLocation();
  const dedicated =
    typeof window === "undefined"
      ? undefined
      : (Object.entries(APP_PROFILES).find(
          ([key, app]) => key !== "cliente" && app.origin === window.location.origin,
        )?.[0] as PerfilApp | undefined);
  const profile = dedicated ?? appProfileFromUrl(location.pathname, location.searchStr);
  const [available, setAvailable] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const monitor = useRef<ReturnType<typeof createAppUpdateMonitor> | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const origin = window.location.origin;
    const watcher = createAppUpdateMonitor(
      appVersionFingerprint(document.documentElement.outerHTML, origin),
      () => fetchAppVersion(origin),
      setAvailable,
      () => window.location.reload(),
    );
    monitor.current = watcher;
    const check = () => {
      if (document.visibilityState !== "hidden" && navigator.onLine !== false) void watcher.check();
    };
    check();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    return () => {
      watcher.stop();
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const check = () => {
      if (document.visibilityState !== "hidden" && navigator.onLine !== false)
        void monitor.current?.check();
    };
    const timer = window.setInterval(check, prefs.economia_dados ? 300000 : 20000);
    return () => window.clearInterval(timer);
  }, [prefs.economia_dados]);

  return (
    <Dialog
      open={!!available && available !== dismissed}
      onOpenChange={(open) => {
        if (!open && !busy) setDismissed(available);
      }}
    >
      <DialogContent className={`${APP_PROFILES[profile].theme} max-w-sm`}>
        <div className="flex justify-center">
          <IFomeLogo perfil={profile} size="md" showWord={false} />
        </div>
        <DialogHeader>
          <DialogTitle>Nova atualização disponível</DialogTitle>
          <DialogDescription>
            Uma nova versão do PedeTrem está pronta. Toque em atualizar para carregar as melhorias.
          </DialogDescription>
        </DialogHeader>
        <Button
          disabled={busy}
          onClick={() => {
            setBusy(monitor.current?.apply() === true);
          }}
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {busy ? "Atualizando…" : "Atualizar agora"}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => setDismissed(available)}>
          Agora não
        </Button>
      </DialogContent>
    </Dialog>
  );
}
