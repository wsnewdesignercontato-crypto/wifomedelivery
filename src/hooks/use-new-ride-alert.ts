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

export function useNewRideAlert(courier: Courier, soundEnabled = true) {
  const navigate = useNavigate();
  const alertedRef = useRef<Set<string>>(new Set());
  const activeCheckRef = useRef<boolean>(false);

  useEffect(() => {
    if (!courier || courier.status !== "online" || (courier.aprovacao && courier.aprovacao !== "approved")) return;

    async function fire(deliveryId: string) {
      if (alertedRef.current.has(deliveryId)) return;
      alertedRef.current.add(deliveryId);
      // Skip alert if the courier already has an active delivery
      if (activeCheckRef.current) return;
      activeCheckRef.current = true;
      const { data: ativa } = await supabase
        .from("deliveries")
        .select("id")
        .eq("entregador_id", courier!.user_id)
        .not("status", "in", "(delivered,cancelled)")
        .limit(1)
        .maybeSingle();
      activeCheckRef.current = false;
      if (ativa) return;

      if (soundEnabled) playBeep();
      toast("🛵 Nova corrida disponível!", {
        description: "Toque para ver os detalhes e aceitar antes que outro entregador.",
        duration: 15000,
        action: { label: "Ver", onClick: () => navigate({ to: "/entregador/corridas" }) },
      });
    }

    const ch = supabase
      .channel("courier-new-ride-alert-" + courier.user_id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "deliveries", filter: "status=eq.broadcasting" },
        (p) => fire((p.new as { id: string }).id),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "deliveries", filter: "status=eq.broadcasting" },
        (p) => {
          const n = p.new as { id: string; status: string };
          const o = p.old as { status: string };
          if (n.status === "broadcasting" && o?.status !== "broadcasting") fire(n.id);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [courier?.user_id, courier?.status, courier?.aprovacao, soundEnabled, navigate]);
}
