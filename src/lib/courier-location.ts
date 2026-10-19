export function freshDevicePoint(
  position: Pick<GeolocationPosition, "coords" | "timestamp">,
  now = Date.now(),
) {
  const { latitude: lat, longitude: lng, accuracy, heading, speed } = position.coords;
  const age = now - position.timestamp;
  if (
    ![lat, lng, age].every(Number.isFinite) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180 ||
    age < -30000 ||
    age > 30000
  )
    return null;
  return {
    lat,
    lng,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    heading: Number.isFinite(heading) ? heading : null,
    speed: Number.isFinite(speed) ? speed : null,
  };
}
