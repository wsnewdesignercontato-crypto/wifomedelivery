import { useEffect, useRef, useState } from "react";
import type { CircleMarker, Map as LeafletMap, TileLayer } from "leaflet";
import "leaflet/dist/leaflet.css";
import { mapViewportKey, validMapPoint, type MapPoint } from "@/lib/map-utils";

export type MapMarker = MapPoint & { id: string; title: string; detail?: string; color?: string };
const tileUrl =
  import.meta.env.VITE_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const attribution =
  import.meta.env.VITE_MAP_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export default function OpenStreetMap({
  markers,
  userLocation,
  focusedId,
  onSelectLocation,
}: {
  markers: MapMarker[];
  userLocation?: MapPoint | null;
  focusedId?: string | null;
  onSelectLocation?: (point: MapPoint) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const tileRef = useRef<TileLayer | null>(null);
  const markerRefs = useRef(new Map<string, CircleMarker>());
  const fittedRef = useRef<string | null>(null);
  const selectRef = useRef(onSelectLocation);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tileFailed, setTileFailed] = useState(false);
  useEffect(() => {
    selectRef.current = onSelectLocation;
  }, [onSelectLocation]);

  useEffect(() => {
    const markersForCleanup = markerRefs.current;
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    let frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        mapRef.current?.invalidateSize({ pan: false, debounceMoveend: true }),
      );
    };
    const resume = () => {
      if (document.visibilityState === "visible") resize();
    };
    import("leaflet")
      .then((L) => {
        if (cancelled || !containerRef.current) return;
        const map = L.map(containerRef.current).setView([-14.2, -51.9], 4);
        const errors = new Set<string>();
        const tiles = L.tileLayer(tileUrl, { attribution, maxZoom: 19 });
        tiles.on("tileerror", (event) => {
          errors.add(event.tile.src);
          setTileFailed(true);
        });
        tiles.on("tileload", (event) => {
          errors.delete(event.tile.src);
          setTileFailed(errors.size > 0);
        });
        tiles.addTo(map);
        map.on("click", (event) =>
          selectRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng }),
        );
        mapRef.current = map;
        tileRef.current = tiles;
        observer = new ResizeObserver(resize);
        observer.observe(containerRef.current);
        window.addEventListener("online", resize);
        document.addEventListener("visibilitychange", resume);
        setReady(true);
        resize();
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("online", resize);
      document.removeEventListener("visibilitychange", resume);
      mapRef.current?.remove();
      mapRef.current = null;
      tileRef.current = null;
      markersForCleanup.clear();
      fittedRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      const map = mapRef.current;
      if (cancelled || !map) return;
      const all = [...markers.filter(validMapPoint)];
      if (validMapPoint(userLocation))
        all.push({
          ...userLocation,
          id: "device-location",
          title: "Sua localização",
          color: "#3B82F6",
        });
      const ids = new Set(all.map((m) => m.id));
      for (const [id, marker] of markerRefs.current)
        if (!ids.has(id)) {
          marker.remove();
          markerRefs.current.delete(id);
        }
      for (const item of all) {
        const content = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = item.title;
        content.appendChild(title);
        if (item.detail) {
          const detail = document.createElement("div");
          detail.textContent = item.detail;
          content.appendChild(detail);
        }
        let marker = markerRefs.current.get(item.id);
        if (!marker) {
          marker = L.circleMarker([item.lat, item.lng], {
            radius: 10,
            color: "#fff",
            weight: 3,
            fillOpacity: 1,
          }).addTo(map);
          markerRefs.current.set(item.id, marker);
          marker.bindPopup(content);
          const label = document.createElement("span");
          label.textContent = item.title;
          marker.bindTooltip(label);
        } else marker.setPopupContent(content);
        marker.setLatLng([item.lat, item.lng]).setStyle({ fillColor: item.color || "#FF6B00" });
      }
      const key = mapViewportKey(markers, userLocation);
      if (key && key !== fittedRef.current && all.length) {
        map.fitBounds(L.latLngBounds(all.map((m) => [m.lat, m.lng])), {
          padding: [35, 35],
          maxZoom: 16,
          animate: false,
        });
        fittedRef.current = key;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ready, markers, userLocation]);

  useEffect(() => {
    const marker = focusedId ? markerRefs.current.get(focusedId) : null;
    if (marker && mapRef.current) {
      mapRef.current.setView(marker.getLatLng(), 16);
      marker.openPopup();
    }
  }, [focusedId, ready, markers]);

  function center() {
    void import("leaflet").then((L) => {
      const positions = [...markerRefs.current.values()].map((m) => m.getLatLng());
      if (positions.length)
        mapRef.current?.fitBounds(L.latLngBounds(positions), { padding: [35, 35], maxZoom: 16 });
    });
  }
  return (
    <div className="relative isolate h-full w-full min-w-0">
      <div
        ref={containerRef}
        className="h-full w-full"
        role="region"
        aria-label="Mapa de lojas e entregadores"
      />
      <button
        type="button"
        onClick={center}
        className="absolute right-3 top-3 z-[500] rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow"
        aria-label="Centralizar todos no mapa"
      >
        Centralizar
      </button>
      {tileFailed && (
        <div
          role="status"
          className="absolute bottom-8 left-3 right-3 z-[500] rounded-lg bg-white p-3 text-sm text-slate-900 shadow"
        >
          Falha ao carregar partes do mapa.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              setTileFailed(false);
              tileRef.current?.redraw();
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}
      {failed && (
        <div
          role="alert"
          className="absolute inset-0 flex items-center justify-center bg-muted p-4 text-center text-sm"
        >
          Mapa indisponível no momento. Atualize a página para tentar novamente.
        </div>
      )}
    </div>
  );
}
