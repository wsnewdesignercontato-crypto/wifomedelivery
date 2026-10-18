import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { notificationErrorMessage } from "@/lib/notification-errors";
import { PUSH_SW_URL, pushSupported } from "@/lib/push-config";
import { devicePushSubscription, setDevicePushEnabled } from "@/lib/push-subscription";
import { savePushSubscription, removePushSubscription, sendTestPush } from "@/lib/push.functions";

type PermissionState = "unsupported" | "default" | "granted" | "denied";

/** Define o "balãozinho" com a quantidade de notificações no ícone do app. */
export async function setAppBadgeCount(count: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0) await nav.setAppBadge?.(count);
    else await nav.clearAppBadge?.();
  } catch {
    /* não suportado neste aparelho */
  }
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<PermissionState>("unsupported");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) return;
    setPermission(Notification.permission as PermissionState);
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration(PUSH_SW_URL);
        const sub = await reg?.pushManager.getSubscription();
        setSubscribed(!!sub);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const enable = useCallback(async () => {
    if (!pushSupported()) {
      toast.error(
        "Seu navegador não suporta notificações. No iPhone, adicione o app à Tela de Início primeiro.",
      );
      return false;
    }
    // Dentro da pré-visualização (iframe) o navegador bloqueia o pedido automaticamente.
    if (typeof window !== "undefined" && window.self !== window.top) {
      toast.error(
        "Abra o app em uma aba própria (ou pelo ícone instalado no celular) para ativar os alertas — a pré-visualização bloqueia o pedido de permissão.",
      );
      return false;
    }
    if (Notification.permission === "denied") {
      toast.error(
        "As notificações estão bloqueadas para este site. Toque no cadeado ao lado do endereço e permita Notificações, depois tente de novo.",
      );
      setPermission("denied");
      return false;
    }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PermissionState);
      if (perm !== "granted") {
        toast.error(
          "Permissão de notificações negada. Libere nas configurações do navegador para receber os avisos.",
        );
        return false;
      }

      await savePushSubscription({
        data: await devicePushSubscription(),
      });
      setDevicePushEnabled(true);

      setSubscribed(true);
      toast.success(
        "Alertas ativados! Envie um teste para conferir as notificações neste celular.",
      );
      return true;
    } catch (err) {
      console.error(err);
      toast.error(notificationErrorMessage(err, "Não foi possível ativar as notificações."));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setDevicePushEnabled(false);
    try {
      const reg = await navigator.serviceWorker.getRegistration(PUSH_SW_URL);
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription({ data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast.success("Notificações desativadas.");
    } catch {
      toast.error("Não foi possível desativar agora.");
    } finally {
      setBusy(false);
    }
  }, []);

  const test = useCallback(async () => {
    setBusy(true);
    try {
      toast.info("Teste em 5 segundos. Minimize o aplicativo para conferir o aviso.");
      const res = (await sendTestPush()) as { ok: boolean; sent: number; reason?: string };
      if (res.reason === "configuracao") {
        toast.error("O serviço de notificações precisa de ajuste no servidor. Avise o suporte.");
      } else if (res.reason === "sem-aparelhos") {
        toast.error("Nenhum aparelho ativo. Toque em Ativar primeiro.");
      } else if (res.ok) {
        toast.success(
          `Notificação de teste enviada para ${res.sent} aparelho(s). Confira a tela do celular.`,
        );
      } else {
        toast.error("Não foi possível entregar o teste neste aparelho.");
      }
      return res;
    } catch (err) {
      console.error(err);
      toast.error("Falha ao enviar a notificação de teste.");
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  return { permission, subscribed, busy, enable, disable, test, supported: pushSupported() };
}

/** Mantém o balãozinho do ícone sincronizado com as notificações não lidas. */
export function useUnreadBadge(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId) return;
    let active = true;

    const refresh = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("lida", false);
      if (active) await setAppBadgeCount(count ?? 0);
    };

    refresh();
    const ch = supabase
      .channel(`badge-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => refresh(),
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [userId]);
}
