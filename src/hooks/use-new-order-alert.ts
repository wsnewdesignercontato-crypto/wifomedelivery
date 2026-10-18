import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ensureRingtoneUnlocked, startRideRingtone, stopRideRingtone } from "@/lib/ride-ringtone";
import { bindResumeRefresh } from "@/lib/resume-refresh";
import { pendingOrderStillOpen } from "@/lib/order-acceptance";
type PendingOrder = {
  id: string;
  status: string;
  total_cents: number;
  acceptance_deadline: string | null;
};
/** One persistent alert for all unhandled orders, across every merchant screen. */
export function useNewOrderAlert(establishmentId: string | undefined) {
  const [pending, setPending] = useState<PendingOrder[]>([]);
  const pendingRef = useRef<PendingOrder[]>([]);
  useEffect(() => {
    pendingRef.current = [];
    setPending([]);
    if (!establishmentId) return;
    ensureRingtoneUnlocked();
    let active = true,
      sequence = 0;
    const seen = new Set<string>();
    const apply = (list: PendingOrder[]) => {
      const open = list.filter((order) => pendingOrderStillOpen(order));
      pendingRef.current = open;
      setPending(open);
      if (open.length) startRideRingtone();
      else stopRideRingtone();
    };
    async function reload() {
      const request = ++sequence;
      const { data, error } = await supabase
        .from("orders")
        .select("id,status,total_cents,acceptance_deadline")
        .eq("establishment_id", establishmentId!)
        .eq("status", "placed")
        .order("created_at", { ascending: true })
        .limit(100);
      if (!active || request !== sequence || error) return;
      const list = (data ?? []) as PendingOrder[];
      const fresh = list.filter((order) => !seen.has(order.id) && pendingOrderStillOpen(order));
      list.forEach((order) => seen.add(order.id));
      apply(list);
      if (fresh.length)
        toast.success(
          fresh.length === 1 ? "Novo pedido recebido!" : `${fresh.length} novos pedidos recebidos!`,
          {
            description:
              "Abra Pedidos para aceitar. O alerta para quando o pedido for atendido ou expirar.",
            duration: 8000,
          },
        );
    }
    void reload();
    const channel = supabase
      .channel("estab-new-order-" + establishmentId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `establishment_id=eq.${establishmentId}`,
        },
        () => {
          void reload();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void reload();
      });
    const stopResume = bindResumeRefresh(reload);
    const refresh = setInterval(() => {
      void reload();
    }, 5000);
    const expiry = setInterval(() => {
      if (pendingRef.current.some((order) => !pendingOrderStillOpen(order)))
        apply(pendingRef.current);
    }, 1000);
    return () => {
      active = false;
      sequence++;
      clearInterval(refresh);
      clearInterval(expiry);
      stopResume();
      supabase.removeChannel(channel);
      stopRideRingtone();
    };
  }, [establishmentId]);
  const firstDeadline =
    pending
      .map((order) => order.acceptance_deadline)
      .filter((value): value is string => !!value)
      .sort()[0] ?? null;
  return { pendingCount: pending.length, firstDeadline };
}
