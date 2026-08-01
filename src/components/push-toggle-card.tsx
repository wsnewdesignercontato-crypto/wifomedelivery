import { BellOff, BellRing } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { usePushNotifications } from "@/hooks/use-push-notifications";

/** Cartão para ligar/desligar as notificações que aparecem na tela do celular. */
export function PushToggleCard({ className = "" }: { className?: string }) {
  const push = usePushNotifications();
  if (!push.supported) return null;

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
                ? "Você recebe avisos mesmo com o app fechado."
                : "Receba avisos na tela mesmo com o app fechado."}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant={push.subscribed ? "outline" : "default"}
          disabled={push.busy}
          onClick={() => (push.subscribed ? push.disable() : push.enable())}
          className="shrink-0 rounded-full"
        >
          {push.subscribed ? "Desativar" : "Ativar"}
        </Button>
      </div>

      {push.permission === "denied" && (
        <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
          As notificações estão bloqueadas para este site. Toque no cadeado ao lado do endereço, permita
          "Notificações" e tente novamente.
        </p>
      )}

      {push.subscribed && (
        <Button
          size="sm"
          variant="secondary"
          disabled={push.busy}
          onClick={() => push.test()}
          className="w-full rounded-full"
        >
          <Send className="mr-2 h-4 w-4" />
          Enviar notificação de teste
        </Button>
      )}
    </div>
  );
}
