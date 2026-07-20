import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

type Courier = { user_id: string; status: string | null; aprovacao?: string | null } | null;

function playBeep() {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [0, 0.18, 0.36].forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now + t);
      osc.frequency.linearRampToValueAtTime(1320, now + t + 0.12);
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.35, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.16);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {}
  try { navigator.vibrate?.([120, 60, 120, 60, 200]); } catch {}
}

/**
 * Toca beep continuamente enquanto houver corridas broadcasting disponíveis
 * e o entregador estiver online, aprovado e sem entrega ativa. Para ao aceitar
 * (fica ocupado) ou quando não sobra nenhuma corrida.
 */
export function useNewRideAlert(courier: Courier, soundEnabled = true) {
  const navigate = useNavigate();
  const toastIdRef = useRef<string | number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!courier || courier.status !== "online" || (courier.aprovacao && courier.aprovacao !== "approved")) {
      // limpa qualquer alerta ativo se ele mudou de status
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      if (toastIdRef.current != null) { toast.dismiss(toastIdRef.current); toastIdRef.current = null; }
      return;
    }

    let cancelled = false;

    async function evaluate() {
      if (cancelled || !courier) return;

      // Já tem entrega ativa? Não alerta.
      const { data: ativa } = await supabase
        .from("deliveries")
        .select("id")
        .eq("entregador_id", courier.user_id)
        .not("status", "in", "(delivered,cancelled)")
        .limit(1)
        .maybeSingle();

      // Tem corrida disponível? (broadcast geral OU direcionada pra mim)
      const { data: disp } = await supabase
        .from("deliveries")
        .select("id")
        .eq("status", "broadcasting")
        .or(`entregador_id.is.null,entregador_id.eq.${courier.user_id}`)
        .limit(1);

      const hasRide = !ativa && (disp?.length ?? 0) > 0;

      if (hasRide) {
        if (!intervalRef.current) {
          if (soundEnabled) playBeep();
          toastIdRef.current = toast("🛵 Nova corrida disponível!", {
            description: "Aceite antes que outro entregador.",
            duration: Infinity,
            action: { label: "Ver", onClick: () => navigate({ to: "/entregador/corridas" }) },
          });
          intervalRef.current = setInterval(() => {
            if (soundEnabled) playBeep();
          }, 4000);
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
