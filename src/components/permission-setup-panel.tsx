import { BellRing, MapPin, CheckCircle2, Loader2 } from "lucide-react";
import { APP_PROFILES, type PerfilApp } from "@/lib/app-profiles";
import type { AppPermission, InstalledPermissions } from "@/lib/installed-permissions";
import { IFomeLogo } from "@/components/ifome-logo";
import { Button } from "@/components/ui/button";
import { PermissionHelpDialog } from "@/components/permission-help-dialog";

type Props = {
  profile: PerfilApp;
  snapshot: InstalledPermissions;
  busy: "notifications" | "location" | null;
  error: string;
  onNotifications: () => void;
  onLocation: () => void;
  onDismiss: () => void;
  onRefresh: () => void;
};

function label(permission: AppPermission, complete: boolean): string {
  if (complete) return "Autorizada";
  if (permission === "denied") return "Bloqueada nos ajustes";
  if (permission === "unsupported") return "Indisponível neste aparelho";
  return "Você pode ativar quando quiser";
}

export function PermissionSetupPanel({
  profile,
  snapshot,
  busy,
  error,
  onNotifications,
  onLocation,
  onDismiss,
  onRefresh,
}: Props) {
  const app = APP_PROFILES[profile];
  const notificationsDone = snapshot.notifications === "granted" && snapshot.pushOptIn === true;
  const locationDone = snapshot.location === "granted" && snapshot.locationEnabled;
  const cards = [
    {
      kind: "push" as const,
      title: "Notificações",
      Icon: BellRing,
      permission: snapshot.notifications,
      done: notificationsDone,
      loading: busy === "notifications",
      activate: onNotifications,
      description:
        profile === "estabelecimento"
          ? "Receba avisos de novos pedidos na sua loja."
          : profile === "entregador"
            ? "Receba avisos de novas corridas e entregas."
            : "Acompanhe os avisos de cada etapa do seu pedido.",
      action: "Ativar notificações",
    },
    {
      kind: "location" as const,
      title: "Localização",
      Icon: MapPin,
      permission: snapshot.location,
      done: locationDone,
      loading: busy === "location",
      activate: onLocation,
      description:
        profile === "entregador"
          ? "Encontre corridas próximas e acompanhe suas entregas."
          : "Encontre locais próximos e facilite suas entregas.",
      action: "Ativar localização",
    },
  ];
  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <IFomeLogo perfil={profile} size="md" showWord={false} />
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Ative os recursos que ajudam no seu dia a dia. Você também pode continuar e configurar
        depois.
      </p>
      {cards.map(
        ({ kind, title, Icon, permission, done, loading, activate, description, action }) => (
          <section
            key={kind}
            className="space-y-3 rounded-2xl border border-border bg-card p-4"
            aria-label={title}
          >
            <div className="flex items-start gap-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{description}</p>
              </div>
              {done && (
                <CheckCircle2
                  aria-label="Autorizada"
                  className="h-5 w-5 shrink-0 text-emerald-600"
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground" role="status">
              {label(permission, done)}
            </p>
            {!done && permission !== "denied" && permission !== "unsupported" && (
              <Button type="button" className="w-full" disabled={busy !== null} onClick={activate}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {action}
              </Button>
            )}
            {!done && (permission === "denied" || permission === "unsupported") && (
              <PermissionHelpDialog kind={kind} themeClass={app.theme} />
            )}
          </section>
        ),
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          {error}
        </p>
      )}
      <Button type="button" variant="outline" className="w-full" onClick={onDismiss}>
        Continuar por enquanto
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        disabled={busy !== null}
        onClick={onRefresh}
      >
        Verificar permissões
      </Button>
    </div>
  );
}
