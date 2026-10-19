import { validMapPoint } from "./map-utils";

export type LiveCourier = {
  courier_id: string;
  nome: string;
  status: string;
  veiculo: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string | null;
  order_id: string | null;
};
export function locationAge(timestamp: string | null, now = Date.now()): number | null {
  if (!timestamp) return null;
  const age = now - Date.parse(timestamp);
  return Number.isFinite(age) && age >= -30000 ? Math.max(0, age) : null;
}
export function courierLocationState(courier: LiveCourier, now = Date.now()) {
  const age = locationAge(courier.created_at, now);
  if (!validMapPoint(courier) || age === null) return "missing";
  return age <= 60000 ? "live" : "stale";
}
export function locationAgeLabel(timestamp: string | null, now = Date.now()) {
  const age = locationAge(timestamp, now);
  if (age === null) return "Sem localização";
  if (age < 60000) return "GPS há " + Math.floor(age / 1000) + " s";
  if (age < 3600000) return "GPS há " + Math.floor(age / 60000) + " min";
  return "GPS em " + new Date(timestamp!).toLocaleString("pt-BR");
}
