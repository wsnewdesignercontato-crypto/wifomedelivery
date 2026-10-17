import { useEffect } from "react";
import { useLocation, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { APP_PROFILES, appProfileFromUrl, type PerfilApp } from "@/lib/app-profiles";
import { needsInstalledPermissions } from "@/lib/installed-permissions";
import { syncGrantedPushSubscription } from "@/lib/push-subscription";
import { savePushSubscription } from "@/lib/push.functions";
import { useInstalledPermissions } from "@/hooks/use-installed-permissions";
import { PermissionSetupPanel } from "@/components/permission-setup-panel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function InstalledAppPermissionPrompt() {
  const location = useLocation();
  const dedicated =
    typeof window === "undefined"
      ? undefined
      : (Object.entries(APP_PROFILES).find(
          ([profile, app]) => profile !== "cliente" && app.origin === window.location.origin,
        )?.[0] as PerfilApp | undefined);
  const profile = dedicated ?? appProfileFromUrl(location.pathname, location.searchStr);
  const app = APP_PROFILES[profile];
  const setup = useInstalledPermissions(profile);
  const { installed, notifications, pushOptIn } = setup.snapshot;
  const userId = useRouterState({
    select: (state) => {
      for (const match of state.matches) {
        const context = match.context as { user?: { id?: string }; isGuest?: boolean } | undefined;
        if (context?.isGuest === false && context.user?.id) return context.user.id;
      }
      return null;
    },
  });

  useEffect(() => {
    if (!installed || notifications !== "granted" || pushOptIn === false || !userId) return;
    let active = true;
    void syncGrantedPushSubscription(userId, async (subscription) => {
      if (!active) return;
      await savePushSubscription({ data: subscription });
    }).catch(() => {
      if (active)
        toast.info(
          "Não foi possível ativar os avisos deste aparelho. Você pode tentar novamente nas configurações de notificações.",
        );
    });
    return () => {
      active = false;
    };
  }, [installed, notifications, pushOptIn, userId]);

  return (
    <Dialog
      open={!setup.dismissed && needsInstalledPermissions(setup.snapshot)}
      onOpenChange={(open) => {
        if (!open) setup.dismiss();
      }}
    >
      <DialogContent className={`${app.theme} max-w-md`}>
        <DialogHeader>
          <DialogTitle>Prepare seu {app.shortName}</DialogTitle>
          <DialogDescription>
            Notificações e localização são opcionais. Autorize pelo celular ou continue sem ativar
            agora.
          </DialogDescription>
        </DialogHeader>
        <PermissionSetupPanel
          profile={profile}
          snapshot={setup.snapshot}
          busy={setup.busy}
          error={setup.error}
          onNotifications={() => void setup.notifications()}
          onLocation={() => void setup.location()}
          onDismiss={setup.dismiss}
          onRefresh={() => void setup.refresh()}
        />
      </DialogContent>
    </Dialog>
  );
}
