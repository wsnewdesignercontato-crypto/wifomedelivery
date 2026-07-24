import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

type Courier = { user_id: string; status: string | null; aprovacao?: string | null } | null;

// Contexto de áudio global reutilizável — precisa ser criado/resumido após
// interação do usuário, senão o browser bloqueia som (autoplay policy).
let sharedCtx: AudioContext | null = null;
let unlocked = false;

function getCtx(): AudioContext | null {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
    if (!Ctx) return null;
    if (!sharedCtx) sharedCtx = new Ctx();
    if (sharedCtx.state === "suspended") sharedCtx.resume().catch(() => {});
    return sharedCtx;
  } catch { return null; }
}

function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  const ctx = getCtx();
  if (!ctx) return;
  // Toca um "silêncio" pra destravar
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.02);
  } catch {}
}

function playSiren() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  // Sirene "urgente" estilo Uber/99: 7 bipes alternados, bem audíveis
  const pattern = [0, 0.14, 0.28, 0.42, 0.56, 0.72, 0.88];
  pattern.forEach((t, i) => {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      const base = i % 2 === 0 ? 980 : 1320;
      osc.frequency.setValueAtTime(base, now + t);
      osc.frequency.linearRampToValueAtTime(base + 420, now + t + 0.11);
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.95, now + t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.13);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.15);
    } catch {}
  });
  try { navigator.vibrate?.([250, 90, 250, 90, 250, 90, 400]); } catch {}
}

function nativeNotify() {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      const n = new Notification("🛵 Nova corrida WiFome!", {
        body: "Toque para aceitar antes de outro entregador.",
        tag: "wifome-ride",
        requireInteraction: true,
      });
      n.onclick = () => { window.focus(); n.close(); };
    } else if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  } catch {}
}

/**
 * Toca sirene continuamente enquanto houver corridas broadcasting disponíveis
 * e o entregador estiver online, aprovado e sem entrega ativa.
 */
export function useNewRideAlert(courier: Courier, soundEnabled = true) {
  const navigate = useNavigate();
  const toastIdRef = useRef<string | number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Destrava áudio no primeiro clique/toque/tecla do usuário
  useEffect(() => {
    const handler = () => { unlockAudio(); };
    window.addEventListener("click", handler, { once: false });
    window.addEventListener("touchstart", handler, { once: false });
    window.addEventListener("keydown", handler, { once: false });
    // Pede permissão de notificação nativa uma vez
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    } catch {}
    return () => {
      window.removeEventListener("click", handler);
      window.removeEventListener("touchstart", handler);
      window.removeEventListener("keydown", handler);
    };
  }, []);

  useEffect(() => {
    if (!courier || courier.status !== "online" || (courier.aprovacao && courier.aprovacao !== "approved")) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      if (toastIdRef.current != null) { toast.dismiss(toastIdRef.current); toastIdRef.current = null; }
      return;
    }

    let cancelled = false;

    async function evaluate() {
      if (cancelled || !courier) return;

      const { data: ativa } = await supabase
        .from("deliveries")
        .select("id")
        .eq("entregador_id", courier.user_id)
        .not("status", "in", "(delivered,cancelled)")
        .limit(1)
        .maybeSingle();

      const { data: disp } = await supabase
        .from("deliveries")
        .select("id")
        .eq("status", "broadcasting")
        .or(`entregador_id.is.null,entregador_id.eq.${courier.user_id}`)
        .limit(1);

      const hasRide = !ativa && (disp?.length ?? 0) > 0;

      if (hasRide) {
        if (!intervalRef.current) {
          if (soundEnabled) playSiren();
          nativeNotify();
          toastIdRef.current = toast("🛵 Nova corrida disponível!", {
            description: "Aceite antes que outro entregador!",
            duration: Infinity,
            action: { label: "Ver agora", onClick: () => navigate({ to: "/entregador/corridas" }) },
          });
          intervalRef.current = setInterval(() => {
            if (soundEnabled) playSiren();
          }, 2500);
        }
      } else {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        if (toastIdRef.current != null) { toast.dismiss(toastIdRef.current); toastIdRef.current = null; }
      }
    }

    evaluate();
    const ch = supabase
      .channel("courier-ride-alert-" + courier.user_id)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => evaluate())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      if (toastIdRef.current != null) { toast.dismiss(toastIdRef.current); toastIdRef.current = null; }
    };
  }, [courier?.user_id, courier?.status, courier?.aprovacao, soundEnabled, navigate]);
}
