export type MapPoint = { lat: number; lng: number };

export function validMapPoint(point: unknown): point is MapPoint {
  if (!point || typeof point !== "object") return false;
  const { lat, lng } = point as MapPoint;
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  );
}

export function deliveryPoint(address: { lat?: unknown; lng?: unknown }): MapPoint | null {
  if (address.lat == null || address.lng == null || address.lat === "" || address.lng === "")
    return null;
  const point = { lat: Number(address.lat), lng: Number(address.lng) };
  return validMapPoint(point) &&
    point.lat >= -34 &&
    point.lat <= 6 &&
    point.lng >= -74 &&
    point.lng <= -34
    ? point
    : null;
}

export function navigationUrl(destination: string): string {
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", destination, travelmode: "driving" })}`;
}

export function mapViewportKey(
  markers: (MapPoint & { id: string })[],
  userLocation?: MapPoint | null,
): string | null {
  const ids = markers
    .filter(validMapPoint)
    .map((marker) => marker.id)
    .sort();
  return ids.length ? JSON.stringify(ids) : validMapPoint(userLocation) ? "gps-only" : null;
}

export function haversineKm(a: MapPoint, b: MapPoint): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(value)));
}
