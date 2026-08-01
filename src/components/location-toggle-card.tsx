import { useCallback, useEffect, useState } from "react";
import { MapPin, MapPinOff } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { PermissionHelpDialog } from "@/components/permission-help-dialog";

const KEY = "wifome:location-enabled";

/** Cartão para ligar/desligar o uso da localização (GPS) do aparelho. */
export function LocationToggleCard({ className = "" }: { className?: string }) {
  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<PermissionState | "unknown">("unknown");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(KEY) === "1");
    } catch {}
    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((p) => {
          setPermission(p.state);
          p.onchange = () => setPermission(p.state);
        })
        .catch(() => {});
    }
  }, []);

  const toggle = useCallback(
    async (v: boolean) => {
      if (!v) {
        setEnabled(false);
        localStorage.setItem(KEY, "0");
        toast.success("Localização desativada no app");
        return;
      }
      if (typeof window !== "undefined" && window.self !== window.top) {
        toast.error(
          "Abra o app em uma aba própria (ou pelo ícone instalado no celular) para liberar o GPS — a pré-visualização bloqueia o pedido.",
        );
        return;
      }
      setBusy(true);
      // Dispara o pedido de permissão do sistema imediatamente.
      navigator.geolocation.getCurrentPosition(
        () => {
          setBusy(false);
          setEnabled(true);
          localStorage.setItem(KEY, "1");
          setPermission("granted");
          toast.success("Localização ativada");
        },
        (err) => {
          setBusy(false);
          setEnabled(false);
          localStorage.setItem(KEY, "0");
          if (err.code === err.PERMISSION_DENIED) {
            setPermission("denied");
            toast.error("Permissão de localização negada. Libere nas configurações do navegador.");
          } else {
            toast.error("Não foi possível obter sua localização agora. Tente de novo.");
          }
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    },
    [],
  );

  if (!supported) return null;

  return (
    <div className={`space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 shadow-card ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
            {enabled ? <MapPin className="h-5 w-5" /> : <MapPinOff className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold">
              {enabled ? "Localização ativa" : "Ativar localização"}
            </p>
            <p className="text-xs text-muted-foreground">
              {enabled
                ? "Usamos seu GPS para mostrar corridas próximas e rotas."
                : "Precisamos do GPS para enviar corridas perto de você."}
            </p>
          </div>
        </div>
        <Switch
          checked={enabled}
          disabled={busy}
          aria-label={enabled ? "Desativar localização" : "Ativar localização"}
          onCheckedChange={toggle}
          className="shrink-0"
        />
      </div>

      {permission === "denied" && (
        <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
          A localização está bloqueada para este site. Toque no cadeado ao lado do endereço, permita
          "Localização" e tente novamente.
        </p>
      )}

      {(!enabled || permission === "denied") && <PermissionHelpDialog kind="location" />}
    </div>
  );
}
