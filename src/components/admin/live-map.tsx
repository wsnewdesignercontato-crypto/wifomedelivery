import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
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

type Point = { courier_id: string; lat: number; lng: number; created_at: string; order_id: string | null };

export default function LiveMap({ points }: { points: Point[] }) {
  // Center on average of points, or default to São Paulo
  const center: [number, number] = points.length
    ? [points.reduce((s,p)=>s+p.lat,0)/points.length, points.reduce((s,p)=>s+p.lng,0)/points.length]
    : [-23.55, -46.63];

  useEffect(() => { window.dispatchEvent(new Event("resize")); }, []);

  return (
    <MapContainer center={center} zoom={points.length ? 13 : 11} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((p) => (
        <Marker key={p.courier_id} position={[p.lat, p.lng]} icon={courierIcon}>
          <Popup>
            <div className="text-xs">
              <p className="font-semibold">Entregador</p>
              <p className="font-mono">{p.courier_id.slice(0,8)}</p>
              {p.order_id && <p>Pedido: {p.order_id.slice(0,8)}</p>}
              <p className="mt-1 text-[10px] opacity-70">{new Date(p.created_at).toLocaleTimeString("pt-BR")}</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
