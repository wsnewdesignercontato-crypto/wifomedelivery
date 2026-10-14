import { useMemo } from "react";
import OpenStreetMap, { type MapMarker } from "@/components/open-street-map";

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

export default function LiveMap({
  points,
  establishments = [],
  userLocation,
}: {
  points: Point[];
  establishments?: Estab[];
  userLocation?: { lat: number; lng: number } | null;
}) {
  const markers = useMemo<MapMarker[]>(
    () => [
      ...establishments.map((e) => ({
        id: e.id,
        lat: e.lat,
        lng: e.lng,
        title: e.nome,
        detail: [e.cidade, e.is_open ? "Aberto" : "Fechado"].filter(Boolean).join(" · "),
        color: "#10B981",
      })),
      ...points.map((p) => ({
        id: p.courier_id,
        lat: p.lat,
        lng: p.lng,
        title: "Entregador",
        detail: [
          p.courier_id.slice(0, 8),
          p.order_id ? "Pedido: " + p.order_id.slice(0, 8) : null,
          new Date(p.created_at).toLocaleTimeString("pt-BR"),
        ]
          .filter(Boolean)
          .join(" · "),
        color: "#FF6B00",
      })),
    ],
    [points, establishments],
  );
  return <OpenStreetMap markers={markers} userLocation={userLocation} />;
}
