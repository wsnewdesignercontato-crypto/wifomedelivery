import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, lazy, Suspense } from "react";

export const Route = createFileRoute("/_authenticated/admin/mapa")({ component: MapaPage });

const LiveMap = lazy(() => import("@/components/admin/live-map"));

type Point = { courier_id: string; lat: number; lng: number; created_at: string; order_id: string | null };

async function fetchLatestPoints() {
  // Latest tracking point per courier from the last 15 minutes
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("tracking_points")
    .select("courier_id,lat,lng,created_at,order_id")
    .gte("created_at", since)
    .order("created_at",{ascending:false})
    .limit(500);
  if (error) throw error;
  const seen = new Set<string>();
  const latest: Point[] = [];
  for (const p of (data ?? []) as Point[]) {
    if (seen.has(p.courier_id)) continue;
    seen.add(p.courier_id);
    latest.push(p);
  }
  return latest;
}

function MapaPage() {
  const { data = [], isLoading } = useQuery({ queryKey:["tracking-latest"], queryFn: fetchLatestPoints, refetchInterval: 8000 });
  const qc = useQueryClient();

  useEffect(() => {
    const ch = supabase.channel("tracking-live")
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"tracking_points" },
        () => qc.invalidateQueries({ queryKey:["tracking-latest"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mapa ao vivo</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Carregando…" : `${data.length} entregador${data.length===1?"":"es"} online (últimos 15min)`}
          </p>
        </div>
        <span className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500"/>Realtime
        </span>
      </div>

      <div className="h-[calc(100vh-220px)] overflow-hidden rounded-xl border border-border bg-card">
        <Suspense fallback={<div className="flex h-full items-center justify-center text-muted-foreground">Carregando mapa…</div>}>
          <LiveMap points={data} />
        </Suspense>
      </div>
    </div>
  );
}
