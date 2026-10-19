import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const h = registerHooks({
  resolve(s, c, n) {
    if (s === "./map-utils") return n("./map-utils.ts", c);
    return n(s, c);
  },
});
const { courierLocationState, locationAgeLabel } = await import("../src/lib/live-map.ts");
const { freshDevicePoint } = await import("../src/lib/courier-location.ts");
h.deregister();
const now = Date.parse("2026-10-19T22:00:00Z");
const courier = {
  courier_id: "driver",
  lat: -20,
  lng: -46,
  created_at: new Date(now - 15000).toISOString(),
};
test("fresh GPS expires even if the driver still says online", () => {
  assert.equal(courierLocationState(courier, now), "live");
  assert.equal(courierLocationState(courier, now + 60000), "stale");
  assert.equal(courierLocationState({ ...courier, created_at: null }, now), "missing");
  assert.equal(courierLocationState({ ...courier, lat: null }, now), "missing");
  assert.equal(courierLocationState({ ...courier, created_at: "bad" }, now), "missing");
  assert.equal(
    courierLocationState({ ...courier, created_at: new Date(now + 60000).toISOString() }, now),
    "missing",
  );
  assert.match(locationAgeLabel(courier.created_at, now), /15 s/);
  assert.equal(locationAgeLabel(null, now), "Sem localização");
});
test("location writer rejects cached or invalid GPS rather than marking it fresh", () => {
  const coords = { latitude: -20, longitude: -46, accuracy: 10, heading: null, speed: null };
  assert.deepEqual(freshDevicePoint({ coords, timestamp: now - 5000 }, now), {
    lat: -20,
    lng: -46,
    accuracy: 10,
    heading: null,
    speed: null,
  });
  for (const timestamp of [now - 31000, NaN, now + 31000])
    assert.equal(freshDevicePoint({ coords, timestamp }, now), null);
  assert.equal(
    freshDevicePoint({ coords: { ...coords, latitude: 91 }, timestamp: now }, now),
    null,
  );
});
