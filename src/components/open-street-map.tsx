import { useEffect, useRef, useState } from "react";
import type { CircleMarker, LayerGroup, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { mapViewportKey, validMapPoint, type MapPoint } from "@/lib/map-utils";

export type MapMarker = MapPoint & { id: string; title: string; detail?: string; color?: string };
const tileUrl =
  import.meta.env.VITE_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const tileAttribution =
  import.meta.env.VITE_MAP_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export default function OpenStreetMap({
  markers,
  userLocation,
}: {
  markers: MapMarker[];
  userLocation?: MapPoint | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<LayerGroup | null>(null);
  const userRef = useRef<CircleMarker | null>(null);
  const fittedRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("leaflet")
      .then((L) => {
        if (cancelled || !containerRef.current) return;
        const map = L.map(containerRef.current).setView([-23.55, -46.63], 12);
        L.tileLayer(tileUrl, { attribution: tileAttribution, maxZoom: 19 }).addTo(map);
        layersRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layersRef.current = null;
      userRef.current = null;
      fittedRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current || !layersRef.current) return;
      layersRef.current.clearLayers();
      const positions: [number, number][] = [];
      for (const marker of markers.filter(validMapPoint)) {
        const content = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = marker.title;
        content.appendChild(title);
        if (marker.detail) {
          const detail = document.createElement("div");
          detail.textContent = marker.detail;
          content.appendChild(detail);
        }
        const position: [number, number] = [marker.lat, marker.lng];
        L.circleMarker(position, {
          radius: 9,
          color: "#fff",
          weight: 3,
          fillColor: marker.color || "#FF6B00",
          fillOpacity: 1,
        })
          .bindPopup(content)
          .addTo(layersRef.current);
        positions.push(position);
      }
      if (validMapPoint(userLocation)) {
        const position: [number, number] = [userLocation.lat, userLocation.lng];
        if (!userRef.current)
          userRef.current = L.circleMarker(position, {
            radius: 7,
            color: "#fff",
            weight: 3,
            fillColor: "#3B82F6",
            fillOpacity: 1,
          })
            .bindTooltip("Sua localização")
            .addTo(mapRef.current);
        else userRef.current.setLatLng(position);
        positions.push(position);
      } else if (userRef.current) {
        userRef.current.remove();
        userRef.current = null;
      }
      const viewportKey = mapViewportKey(markers, userLocation);
      if (viewportKey && viewportKey !== fittedRef.current && positions.length) {
        mapRef.current.fitBounds(L.latLngBounds(positions), { padding: [30, 30], maxZoom: 15 });
        fittedRef.current = viewportKey;
      }
      mapRef.current.invalidateSize();
    });
    return () => {
      cancelled = true;
    };
  }, [ready, markers, userLocation]);

  return (
    <div className="relative isolate h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full"
        role="region"
        aria-label="Mapa de lojas e entregadores"
      />
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted p-4 text-center text-sm">
          Mapa indisponível no momento.
        </div>
      )}
    </div>
  );
}
