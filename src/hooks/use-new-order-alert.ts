import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { playSiren } from "@/hooks/use-new-ride-alert";

/**
 * Alerta o estabelecimento (som + aviso na tela) sempre que um novo pedido chega,
 * em qualquer tela do painel da loja.
 */
export function useNewOrderAlert(establishmentId: string | undefined) {
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!establishmentId) return;

    // Destrava o áudio no primeiro toque/clique do lojista (política de autoplay).
    const unlock = () => playSirenSilently();
    window.addEventListener("pointerdown", unlock, { once: true });

    const ch = supabase
      .channel("estab-new-order-" + establishmentId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `establishment_id=eq.${establishmentId}`,
        },
        (payload) => {
          const row = payload.new as { id?: string; status?: string; total_cents?: number };
          if (!row?.id || seen.current.has(row.id)) return;
          if (row.status !== "placed") return;
          seen.current.add(row.id);

          playSiren();
          if ("vibrate" in navigator) {
            try {
              navigator.vibrate([220, 120, 220, 120, 320]);
            } catch {
              /* ignore */
            }
          }
          const valor = ((row.total_cents ?? 0) / 100).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          });
          toast.success(`🛎️ Novo pedido — ${valor}`, {
            description: "Toque em Pedidos para aceitar e começar o preparo.",
            duration: 12000,
          });
        },
      )
      .subscribe();

    return () => {
      window.removeEventListener("pointerdown", unlock);
      supabase.removeChannel(ch);
    };
  }, [establishmentId]);
}

/** Toca um som inaudível só para liberar o áudio no navegador. */
function playSirenSilently() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.02);
  } catch {
    /* ignore */
  }
}
