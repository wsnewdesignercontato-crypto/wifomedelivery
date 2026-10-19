import { RingtoneTestButton } from "@/components/ringtone-test-button";
import { BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { PermissionHelpDialog } from "@/components/permission-help-dialog";

/** Cartão para ligar/desligar as notificações que aparecem na tela do celular. */
export function PushToggleCard({
  className = "",
  operationalSound = false,
}: {
  className?: string;
  operationalSound?: boolean;
}) {
  const push = usePushNotifications();
  if (!push.supported) return operationalSound ? <RingtoneTestButton /> : null;

  return (
    <div
      className={`space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 shadow-card ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
            {push.subscribed ? <BellRing className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold">
              {push.subscribed ? "Alertas no celular ativos" : "Ativar alertas no celular"}
            </p>
            <p className="text-xs text-muted-foreground">
              {push.subscribed
                ? "Receba avisos mesmo usando outro aplicativo."
                : "Permita notificações para receber avisos em segundo plano."}
            </p>
          </div>
        </div>
        <Switch
          checked={push.subscribed}
          disabled={push.busy}
          aria-label={push.subscribed ? "Desativar notificações" : "Ativar notificações"}
          onCheckedChange={(v) => (v ? push.enable() : push.disable())}
          className="shrink-0"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {operationalSound && <RingtoneTestButton />}
        {push.subscribed && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={push.busy}
            onClick={() => push.test()}
          >
            Enviar notificação de teste
          </Button>
        )}
      </div>

      {push.permission === "denied" && (
        <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
          As notificações estão bloqueadas para este site. Toque no cadeado ao lado do endereço,
          permita "Notificações" e tente novamente.
        </p>
      )}

      {(!push.subscribed || push.permission === "denied") && <PermissionHelpDialog kind="push" />}
    </div>
  );
}
