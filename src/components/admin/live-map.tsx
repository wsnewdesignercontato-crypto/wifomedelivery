import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";

// Fix Leaflet default icon paths (Vite bundler quirk)
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const courierIcon = L.divIcon({
  className: "wifome-courier-marker",
  html: `<div style="background:#FF6B00;border:3px solid white;border-radius:50%;width:22px;height:22px;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const estabIcon = L.divIcon({
  className: "wifome-estab-marker",
  html: `<div style="background:#10B981;border:3px solid white;border-radius:6px;width:22px;height:22px;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:grid;place-items:center;color:white;font-size:12px;font-weight:800;">🏪</div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const userIcon = L.divIcon({
  className: "wifome-user-marker",
  html: `<div style="background:#3B82F6;border:3px solid white;border-radius:50%;width:18px;height:18px;box-shadow:0 0 0 6px rgba(59,130,246,0.25);"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

type Point = { courier_id: string; lat: number; lng: number; created_at: string; order_id: string | null };
type Estab = { id: string; nome: string; lat: number; lng: number; is_open: boolean; cidade: string | null };

export default function LiveMap({
  points,
  establishments = [],
  userLocation,
}: {
  points: Point[];
  establishments?: Estab[];
  userLocation?: { lat: number; lng: number } | null;
}) {
  const all: Array<[number, number]> = [
    ...points.map((p) => [p.lat, p.lng] as [number, number]),
    ...establishments.map((e) => [e.lat, e.lng] as [number, number]),
  ];
  if (userLocation) all.push([userLocation.lat, userLocation.lng]);

  const center: [number, number] = userLocation
    ? [userLocation.lat, userLocation.lng]
    : all.length
      ? [all.reduce((s, p) => s + p[0], 0) / all.length, all.reduce((s, p) => s + p[1], 0) / all.length]
      : [-23.55, -46.63];

  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, []);

  return (
    <MapContainer center={center} zoom={all.length ? 12 : 11} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {userLocation && (
        <>
          <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
            <Popup>
              <div className="text-xs font-semibold">Sua localização</div>
            </Popup>
          </Marker>
          <Circle
            center={[userLocation.lat, userLocation.lng]}
            radius={200}
            pathOptions={{ color: "#3B82F6", fillColor: "#3B82F6", fillOpacity: 0.08 }}
          />
        </>
      )}

      {establishments.map((e) => (
        <Marker key={`estab-${e.id}`} position={[e.lat, e.lng]} icon={estabIcon}>
          <Popup>
            <div className="text-xs">
              <p className="font-semibold">{e.nome}</p>
              {e.cidade && <p className="opacity-70">{e.cidade}</p>}
              <p className="mt-1">
                {e.is_open ? (
                  <span className="font-semibold text-emerald-600">● Aberto</span>
                ) : (
                  <span className="text-muted-foreground">○ Fechado</span>
                )}
              </p>
            </div>
          </Popup>
        </Marker>
      ))}

      {points.map((p) => (
        <Marker key={`courier-${p.courier_id}`} position={[p.lat, p.lng]} icon={courierIcon}>
          <Popup>
            <div className="text-xs">
              <p className="font-semibold">Entregador</p>
              <p className="font-mono">{p.courier_id.slice(0, 8)}</p>
              {p.order_id && <p>Pedido: {p.order_id.slice(0, 8)}</p>}
              <p className="mt-1 text-[10px] opacity-70">
                {new Date(p.created_at).toLocaleTimeString("pt-BR")}
              </p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
