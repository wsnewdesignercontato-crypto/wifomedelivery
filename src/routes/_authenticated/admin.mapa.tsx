import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState, lazy, Suspense } from "react";
import { MapPin, Store, Bike, Loader2, AlertTriangle, Wand2, Eye, EyeOff } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { geocodeMissingEstablishments } from "@/lib/admin-map.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/mapa")({ component: MapaPage });

const LiveMap = lazy(() => import("@/components/admin/live-map"));

type Point = { courier_id: string; lat: number; lng: number; created_at: string; order_id: string | null };
type Estab = { id: string; nome: string; lat: number; lng: number; is_open: boolean; cidade: string | null };

async function fetchLatestPoints(): Promise<Point[]> {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const map = new Map<string, Point>();

  // 1) Últimos tracking_points por entregador (entregas ativas)
  const { data: tp } = await supabase
    .from("tracking_points")
    .select("courier_id,lat,lng,created_at,order_id")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  for (const p of (tp ?? []) as Point[]) {
    if (!map.has(p.courier_id)) map.set(p.courier_id, p);
  }

  // 2) Couriers online (mesmo sem entrega em andamento) via server fn
  const { listAvailableCouriers } = await import("@/lib/couriers.functions");
  const online = await listAvailableCouriers().catch(() => []);
  for (const c of online ?? []) {
    if (c.lat == null || c.lng == null) continue;
    if (map.has(c.user_id)) continue;
    map.set(c.user_id, {
      courier_id: c.user_id,
      lat: c.lat,
      lng: c.lng,
      created_at: c.last_seen ?? new Date().toISOString(),
      order_id: null,
    });
  }
  return Array.from(map.values());
}

async function fetchEstablishments(): Promise<{ withGeo: Estab[]; withoutGeo: { id: string; nome: string; cidade: string | null }[] }> {
  const { data, error } = await supabase
    .from("establishments")
    .select("id,nome,lat,lng,is_open,cidade,status")
    .eq("status", "aprovado");
  if (error) throw error;
  const withGeo: Estab[] = [];
  const withoutGeo: { id: string; nome: string; cidade: string | null }[] = [];
  for (const e of (data ?? []) as (Estab & { lat: number | null; lng: number | null })[]) {
    if (e.lat != null && e.lng != null) withGeo.push(e as Estab);
    else withoutGeo.push({ id: e.id, nome: e.nome, cidade: e.cidade });
  }
  return { withGeo, withoutGeo };
}

function MapaPage() {
  const qc = useQueryClient();
  const { data: points = [], isLoading: loadingPts } = useQuery({
    queryKey: ["tracking-latest"],
    queryFn: fetchLatestPoints,
    refetchInterval: 8000,
  });
  const { data: estabData, isLoading: loadingEst } = useQuery({
    queryKey: ["map-establishments"],
    queryFn: fetchEstablishments,
    refetchInterval: 60000,
  });
  const estabs = estabData?.withGeo ?? [];
  const semGeo = estabData?.withoutGeo ?? [];

  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [showEstabs, setShowEstabs] = useState(true);
  const [showCouriers, setShowCouriers] = useState(true);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const geocodeFn = useServerFn(geocodeMissingEstablishments);

  const filteredEstabs = showEstabs ? (onlyOpen ? estabs.filter((e) => e.is_open) : estabs) : [];
  const filteredPoints = showCouriers ? points : [];

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
      .on("postgres_changes", { event: "*", schema: "public", table: "courier_profiles" }, () =>
        qc.invalidateQueries({ queryKey: ["tracking-latest"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "establishments" }, () =>
        qc.invalidateQueries({ queryKey: ["map-establishments"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  async function rodarGeocoding() {
    setGeocoding(true);
    try {
      const res = await geocodeFn();
      toast.success(`Geocodificação concluída: ${res.atualizados}/${res.total} localizados.`);
      if (res.falhas.length) {
        toast.warning(`${res.falhas.length} sem coordenadas: ${res.falhas.map((f) => f.nome).join(", ")}`);
      }
      qc.invalidateQueries({ queryKey: ["map-establishments"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGeocoding(false);
    }
  }

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
          {estabs.length} de {estabs.length + semGeo.length} estabelecimento{estabs.length + semGeo.length === 1 ? "" : "s"} com posição real
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1">
          <Bike className="h-3.5 w-3.5 text-primary" />
          {points.length} entregador{points.length === 1 ? "" : "es"} online agora
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1">
          <MapPin className="h-3.5 w-3.5 text-blue-500" />
          {userLoc ? "Sua localização ativa" : geoError ? geoError : "Aguardando localização…"}
        </span>
      </div>

      {semGeo.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-amber-700 dark:text-amber-400">
              {semGeo.length} estabelecimento{semGeo.length === 1 ? "" : "s"} sem coordenadas
            </p>
            <p className="truncate text-xs text-amber-700/80 dark:text-amber-400/80">
              {semGeo.map((e) => e.nome).join(" • ")}
            </p>
          </div>
          <button
            onClick={rodarGeocoding}
            disabled={geocoding}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
          >
            {geocoding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            Geocodificar endereços
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2">
        <span className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Camadas</span>
        <button
          onClick={() => setShowEstabs((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
            showEstabs ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-border bg-muted/40 text-muted-foreground"
          }`}
        >
          {showEstabs ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Estabelecimentos ({filteredEstabs.length})
        </button>
        <button
          onClick={() => setShowCouriers((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
            showCouriers ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-muted/40 text-muted-foreground"
          }`}
        >
          {showCouriers ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          <span className="h-2 w-2 rounded-full bg-primary" />
          Entregadores online ({filteredPoints.length})
        </button>
        <button
          onClick={() => setOnlyOpen((v) => !v)}
          disabled={!showEstabs}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
            onlyOpen ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400" : "border-border bg-muted/40 text-muted-foreground"
          }`}
        >
          Apenas abertos
        </button>
        {userLoc && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Você
          </span>
        )}
      </div>

      <div className="h-[calc(100vh-320px)] overflow-hidden rounded-xl border border-border bg-card">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Carregando mapa…
            </div>
          }
        >
          <LiveMap points={filteredPoints} establishments={filteredEstabs} userLocation={userLoc} />
        </Suspense>
      </div>
    </div>
  );
}
