import { useServerFn } from "@tanstack/react-start";
import { geocodeMissingEstablishments } from "@/lib/admin-map.functions";
import { toast } from "sonner";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState, lazy, Suspense, useMemo } from "react";
import { Store, Bike, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StoreLocationEditor } from "@/components/store-location-editor";
import { validMapPoint, type MapPoint } from "@/lib/map-utils";
import { courierLocationState, locationAgeLabel, type LiveCourier } from "@/lib/live-map";
import type { MapMarker } from "@/components/open-street-map";

export const Route = createFileRoute("/_authenticated/admin/mapa")({
  head: () => ({ meta: [{ title: "Mapa ao vivo | PedeTrem Admin" }] }),
  component: MapaPage,
});
const LiveMap = lazy(() => import("@/components/open-street-map"));
async function fetchCouriers(): Promise<LiveCourier[]> {
  const { data, error } = await supabase.rpc("admin_live_couriers");
  if (error) throw new Error("Não foi possível atualizar os entregadores.");
  return (data ?? []) as unknown as LiveCourier[];
}
async function fetchEstablishments() {
  const { data, error } = await supabase
    .from("establishments")
    .select("id,nome,lat,lng,is_open,cidade,endereco")
    .eq("status", "aprovado")
    .order("nome");
  if (error) throw new Error("Não foi possível atualizar os estabelecimentos.");
  return data ?? [];
}
const EMPTY_COURIERS: LiveCourier[] = [];
const EMPTY_STORES: Awaited<ReturnType<typeof fetchEstablishments>> = [];
function MapaPage() {
  const qc = useQueryClient();
  const geocode = useServerFn(geocodeMissingEstablishments);
  const [locating, setLocating] = useState(false);
  async function locateStores() {
    if (locating) return;
    setLocating(true);
    try {
      const result = await geocode();
      await qc.invalidateQueries({ queryKey: ["map-establishments"] });
      if (result.atualizados) toast.success(result.atualizados + " loja(s) localizada(s).");
      if (result.falhas.length)
        toast.warning(
          "Confira o ponto no mapa das lojas: " + result.falhas.map((f) => f.nome).join(", "),
        );
      if (!result.total) toast.success("Todas as lojas já têm localização cadastrada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível localizar as lojas.");
    } finally {
      setLocating(false);
    }
  }
  const drivers = useQuery({
    queryKey: ["tracking-latest"],
    queryFn: fetchCouriers,
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const stores = useQuery({
    queryKey: ["map-establishments"],
    queryFn: fetchEstablishments,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const [connection, setConnection] = useState("CONNECTING");
  const [now, setNow] = useState(Date.now);
  const [showStores, setShowStores] = useState(true);
  const [showDrivers, setShowDrivers] = useState(true);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["tracking-latest"] });
        void qc.invalidateQueries({ queryKey: ["map-establishments"] });
      }, 200);
    };
    const ch = supabase
      .channel("admin-live-map")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tracking_points" },
        refresh,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "courier_profiles" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "establishments" }, refresh)
      .subscribe((status) => {
        setConnection(status);
        if (status === "SUBSCRIBED") refresh();
      });
    const tick = setInterval(() => setNow(Date.now()), 10000);
    const resume = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        refresh();
      }
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", refresh);
    return () => {
      clearTimeout(timer);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", refresh);
      void supabase.removeChannel(ch);
    };
  }, [qc]);
  const couriers = drivers.data ?? EMPTY_COURIERS;
  const establishments = stores.data ?? EMPTY_STORES;
  const live = couriers.filter((c) => courierLocationState(c, now) === "live");
  const located = establishments.filter((e): e is typeof e & MapPoint => validMapPoint(e));
  const markers = useMemo<MapMarker[]>(
    () => [
      ...(showStores
        ? establishments
            .filter((p): p is typeof p & MapPoint => validMapPoint(p))
            .filter((e) => !onlyOpen || e.is_open)
            .map((e) => ({
              id: "store:" + e.id,
              lat: e.lat,
              lng: e.lng,
              title: e.nome,
              detail: [e.is_open ? "Aberto" : "Fechado", e.endereco, e.cidade]
                .filter(Boolean)
                .join(" · "),
              color: "#059669",
            }))
        : []),
      ...(showDrivers
        ? couriers
            .filter((p): p is typeof p & MapPoint => validMapPoint(p))
            .map((c) => ({
              id: "courier:" + c.courier_id,
              lat: c.lat,
              lng: c.lng,
              title: c.nome,
              detail: [
                c.status === "ocupado" ? "Em entrega" : "Disponível",
                locationAgeLabel(c.created_at, now),
              ].join(" · "),
              color: courierLocationState(c, now) === "live" ? "#EA580C" : "#64748B",
            }))
        : []),
    ],
    [establishments, couriers, showStores, showDrivers, onlyOpen, now],
  );
  const error = drivers.error || stores.error;
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mapa ao vivo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lojas e entregadores, com horário da última posição recebida.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void drivers.refetch();
            void stores.refetch();
          }}
          disabled={drivers.isFetching || stores.isFetching}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4">
          <Store className="mb-2 h-5 w-5 text-emerald-600" />
          <strong className="text-2xl">
            {located.length}/{establishments.length}
          </strong>
          <p className="text-xs text-muted-foreground">Lojas no mapa</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <Bike className="mb-2 h-5 w-5 text-orange-600" />
          <strong className="text-2xl">{live.length}</strong>
          <p className="text-xs text-muted-foreground">Entregadores com GPS recente</p>
        </div>
        <div className="col-span-2 rounded-2xl border bg-card p-4 sm:col-span-1">
          <span
            className={`mb-2 block h-2 w-2 rounded-full ${connection === "SUBSCRIBED" && !error ? "bg-emerald-500" : "bg-amber-500"}`}
          />
          <p className="text-sm font-semibold">
            {connection === "SUBSCRIBED" ? "Atualização ao vivo" : "Atualização a cada 8 segundos"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {drivers.dataUpdatedAt
              ? "Consulta às " + new Date(drivers.dataUpdatedAt).toLocaleTimeString("pt-BR")
              : "Conectando…"}
          </p>
        </div>
      </div>
      {located.length < establishments.length && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p>
            Há lojas sem ponto de coleta. Localize pelo endereço ou ajuste o ponto na lista abaixo.
          </p>
          <Button variant="outline" onClick={locateStores} disabled={locating}>
            {locating ? "Localizando…" : "Localizar endereços"}
          </Button>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          {error.message} Os dados exibidos podem estar desatualizados. Use Atualizar para tentar
          novamente.
        </div>
      )}
      <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-3">
        <Button
          variant={showStores ? "default" : "outline"}
          aria-pressed={showStores}
          onClick={() => setShowStores((v) => !v)}
        >
          Lojas
        </Button>
        <Button
          variant={showDrivers ? "default" : "outline"}
          aria-pressed={showDrivers}
          onClick={() => setShowDrivers((v) => !v)}
        >
          Entregadores
        </Button>
        <Button
          variant={onlyOpen ? "default" : "outline"}
          aria-pressed={onlyOpen}
          disabled={!showStores}
          onClick={() => setOnlyOpen((v) => !v)}
        >
          Só lojas abertas
        </Button>
      </div>
      <div className="h-[55dvh] min-h-80 overflow-hidden rounded-2xl border bg-card">
        <Suspense fallback={<p className="p-4">Carregando mapa…</p>}>
          <LiveMap markers={markers} focusedId={focusedId} />
        </Suspense>
      </div>
      <p className="text-xs text-muted-foreground">
        ● Verde: loja · Laranja: entregador com GPS recente · Cinza: última posição, GPS há mais de
        1 minuto. Localizações ausentes não são estimadas.
      </p>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <section className="min-w-0 rounded-2xl border bg-card p-4">
          <h2 className="mb-3 text-base font-semibold">
            Estabelecimentos ({establishments.length})
          </h2>
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {stores.isLoading && <p>Carregando lojas…</p>}
            {establishments.map((e) => (
              <div key={e.id} className="rounded-xl border p-3">
                <div className="mb-2 min-w-0">
                  <p className="break-words font-semibold">{e.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.is_open ? "Aberto" : "Fechado"} · {e.cidade || "Cidade não informada"}
                  </p>
                  <p
                    className={`mt-1 text-xs ${validMapPoint(e) ? "text-emerald-700" : "text-amber-700"}`}
                  >
                    {validMapPoint(e)
                      ? "Localização cadastrada"
                      : "Defina o ponto de coleta para aparecer no mapa"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={!validMapPoint(e)}
                    onClick={() => {
                      setShowStores(true);
                      setOnlyOpen(false);
                      setFocusedId("store:" + e.id);
                    }}
                  >
                    Ver no mapa
                  </Button>
                  <StoreLocationEditor store={e} />
                </div>
              </div>
            ))}
            {!stores.isLoading && !establishments.length && (
              <p className="text-sm text-muted-foreground">Nenhuma loja aprovada.</p>
            )}
          </div>
        </section>
        <section className="min-w-0 rounded-2xl border bg-card p-4">
          <h2 className="mb-3 text-base font-semibold">
            Entregadores disponíveis ou em entrega ({couriers.length})
          </h2>
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {drivers.isLoading && <p>Carregando entregadores…</p>}
            {couriers.map((c) => (
              <div
                key={c.courier_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
              >
                <div className="min-w-0">
                  <p className="break-words font-semibold">{c.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.status === "ocupado" ? "Em entrega" : "Disponível"} ·{" "}
                    {c.veiculo || "Veículo não informado"}
                  </p>
                  <p
                    className={`mt-1 text-xs ${courierLocationState(c, now) === "live" ? "text-orange-700" : "text-muted-foreground"}`}
                  >
                    {locationAgeLabel(c.created_at, now)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={!validMapPoint(c)}
                  onClick={() => {
                    setShowDrivers(true);
                    setFocusedId("courier:" + c.courier_id);
                  }}
                >
                  Ver no mapa
                </Button>
              </div>
            ))}
            {!drivers.isLoading && !couriers.length && (
              <p className="text-sm text-muted-foreground">
                Nenhum entregador disponível ou em entrega.
              </p>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            O entregador precisa estar online, com a localização permitida e o aplicativo ativo. Se
            o celular suspender o GPS, a posição será sinalizada como desatualizada.
          </p>
        </section>
      </div>
    </div>
  );
}
