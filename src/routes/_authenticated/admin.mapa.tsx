import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState, lazy, Suspense } from "react";
import { MapPin, Store, Bike, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/mapa")({ component: MapaPage });

const LiveMap = lazy(() => import("@/components/admin/live-map"));

type Point = { courier_id: string; lat: number; lng: number; created_at: string; order_id: string | null };
type Estab = { id: string; nome: string; lat: number; lng: number; is_open: boolean; cidade: string | null };

async function fetchLatestPoints() {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("tracking_points")
    .select("courier_id,lat,lng,created_at,order_id")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
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

async function fetchEstablishments(): Promise<Estab[]> {
  const { data, error } = await supabase
    .from("establishments")
    .select("id,nome,lat,lng,is_open,cidade,status")
    .eq("status", "aprovado")
    .not("lat", "is", null)
    .not("lng", "is", null);
  if (error) throw error;
  return (data ?? []).filter((e: any) => e.lat != null && e.lng != null) as Estab[];
}

function MapaPage() {
  const { data: points = [], isLoading: loadingPts } = useQuery({
    queryKey: ["tracking-latest"],
    queryFn: fetchLatestPoints,
    refetchInterval: 8000,
  });
  const { data: estabs = [], isLoading: loadingEst } = useQuery({
    queryKey: ["map-establishments"],
    queryFn: fetchEstablishments,
    refetchInterval: 60000,
  });
  const qc = useQueryClient();

  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocalização não suportada neste navegador.");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoError(null);
      },
      (err) => setGeoError(err.message || "Não foi possível obter sua localização."),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    const ch = supabase
      .channel("tracking-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tracking_points" }, () =>
        qc.invalidateQueries({ queryKey: ["tracking-latest"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "establishments" },
        () => qc.invalidateQueries({ queryKey: ["map-establishments"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const loading = loadingPts || loadingEst;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mapa ao vivo</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
              </span>
            ) : (
              <>Visualização em tempo real de estabelecimentos e entregadores.</>
            )}
          </p>
        </div>
        <span className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Realtime
        </span>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1">
          <Store className="h-3.5 w-3.5 text-emerald-600" />
          {estabs.length} estabelecimento{estabs.length === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1">
          <Bike className="h-3.5 w-3.5 text-primary" />
          {points.length} entregador{points.length === 1 ? "" : "es"} online (15min)
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1">
          <MapPin className="h-3.5 w-3.5 text-blue-500" />
          {userLoc ? "Sua localização ativa" : geoError ? geoError : "Aguardando localização…"}
        </span>
      </div>

      <div className="h-[calc(100vh-260px)] overflow-hidden rounded-xl border border-border bg-card">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Carregando mapa…
            </div>
          }
        >
          <LiveMap points={points} establishments={estabs} userLocation={userLoc} />
        </Suspense>
      </div>
    </div>
  );
}
