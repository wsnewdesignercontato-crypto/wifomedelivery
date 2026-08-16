import { useEffect, useRef, useState } from "react";

type Point = {
  courier_id: string;
  lat: number;
  lng: number;
  created_at: string;
  order_id: string | null;
};
type Estab = {
  id: string;
  nome: string;
  lat: number;
  lng: number;
  is_open: boolean;
  cidade: string | null;
};

const BROWSER_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as
  string | undefined;
const TRACKING_ID = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as
  string | undefined;

declare global {
  interface Window {
    google?: typeof google;
    __wifomeInitMap?: () => void;
    __wifomeMapsLoading?: Promise<void>;
  }
}

function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.google?.maps) return Promise.resolve();
  if (window.__wifomeMapsLoading) return window.__wifomeMapsLoading;
  if (!BROWSER_KEY) return Promise.reject(new Error("Google Maps key ausente"));

  window.__wifomeMapsLoading = new Promise<void>((resolve, reject) => {
    window.__wifomeInitMap = () => resolve();
    const s = document.createElement("script");
    const params = new URLSearchParams({
      key: BROWSER_KEY,
      loading: "async",
      callback: "__wifomeInitMap",
    });
    if (TRACKING_ID) params.set("channel", TRACKING_ID);
    s.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    s.async = true;
    s.defer = true;
    s.onerror = () => reject(new Error("Falha ao carregar Google Maps"));
    document.head.appendChild(s);
  });
  return window.__wifomeMapsLoading;
}

export default function LiveMap({
  points,
  establishments = [],
  userLocation,
}: {
  points: Point[];
  establishments?: Estab[];
  userLocation?: { lat: number; lng: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const userCircleRef = useRef<google.maps.Circle | null>(null);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadGoogleMaps()
      .then(() => {
        if (!alive || !containerRef.current) return;
        const center = userLocation
          ? { lat: userLocation.lat, lng: userLocation.lng }
          : establishments[0]
            ? { lat: establishments[0].lat, lng: establishments[0].lng }
            : points[0]
              ? { lat: points[0].lat, lng: points[0].lng }
              : { lat: -23.55, lng: -46.63 };
        mapRef.current = new google.maps.Map(containerRef.current, {
          center,
          zoom: 12,
          disableDefaultUI: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          clickableIcons: false,
        });
        infoRef.current = new google.maps.InfoWindow();
        setReady(true);
      })
      .catch((e) => setErr((e as Error).message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render markers
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    // Clear
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const bounds = new google.maps.LatLngBounds();
    let hasAny = false;

    for (const e of establishments) {
      const m = new google.maps.Marker({
        map,
        position: { lat: e.lat, lng: e.lng },
        title: e.nome,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#10B981",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });
      m.addListener("click", () => {
        infoRef.current?.setContent(
          `<div style="font-size:12px;min-width:140px">
            <div style="font-weight:700">${escapeHtml(e.nome)}</div>
            ${e.cidade ? `<div style="opacity:.7">${escapeHtml(e.cidade)}</div>` : ""}
            <div style="margin-top:4px">${e.is_open ? '<span style="color:#059669;font-weight:600">● Aberto</span>' : '<span style="color:#6b7280">○ Fechado</span>'}</div>
          </div>`,
        );
        infoRef.current?.open({ map, anchor: m });
      });
      markersRef.current.push(m);
      bounds.extend({ lat: e.lat, lng: e.lng });
      hasAny = true;
    }

    for (const p of points) {
      const m = new google.maps.Marker({
        map,
        position: { lat: p.lat, lng: p.lng },
        title: "Entregador",
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: "#FF6B00",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });
      m.addListener("click", () => {
        infoRef.current?.setContent(
          `<div style="font-size:12px;min-width:140px">
            <div style="font-weight:700">Entregador</div>
            <div style="font-family:ui-monospace,monospace">${escapeHtml(p.courier_id.slice(0, 8))}</div>
            ${p.order_id ? `<div>Pedido: ${escapeHtml(p.order_id.slice(0, 8))}</div>` : ""}
            <div style="margin-top:4px;opacity:.7;font-size:10px">${new Date(p.created_at).toLocaleTimeString("pt-BR")}</div>
          </div>`,
        );
        infoRef.current?.open({ map, anchor: m });
      });
      markersRef.current.push(m);
      bounds.extend({ lat: p.lat, lng: p.lng });
      hasAny = true;
    }

    if (userLocation) {
      if (!userMarkerRef.current) {
        userMarkerRef.current = new google.maps.Marker({
          map,
          position: userLocation,
          title: "Sua localização",
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: "#3B82F6",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 3,
          },
          zIndex: 999,
        });
        userCircleRef.current = new google.maps.Circle({
          map,
          center: userLocation,
          radius: 200,
          strokeColor: "#3B82F6",
          strokeOpacity: 0.4,
          strokeWeight: 1,
          fillColor: "#3B82F6",
          fillOpacity: 0.08,
        });
      } else {
        userMarkerRef.current.setPosition(userLocation);
        userCircleRef.current?.setCenter(userLocation);
      }
      bounds.extend(userLocation);
      hasAny = true;
    }

    if (hasAny && establishments.length + points.length > 1) {
      map.fitBounds(bounds, 60);
    }
  }, [ready, points, establishments, userLocation]);

  if (err) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Não foi possível carregar o Google Maps: {err}
      </div>
    );
  }

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
