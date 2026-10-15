import test from "node:test";
import assert from "node:assert/strict";
import {
  haversineKm,
  validMapPoint,
  navigationUrl,
  deliveryPoint,
  mapViewportKey,
} from "../src/lib/map-utils.ts";

test("map points reject missing and impossible coordinates", () => {
  assert.equal(validMapPoint({ lat: -19.9, lng: -43.9 }), true);
  for (const point of [null, { lat: NaN, lng: 0 }, { lat: 91, lng: 0 }, { lat: 0, lng: 181 }]) {
    assert.equal(validMapPoint(point), false);
  }
});
test("external navigation needs no API key and encodes the destination", () => {
  const url = new URL(navigationUrl("Rua A & B, 10, Belo Horizonte"));
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.pathname, "/maps/dir/");
  assert.equal(url.searchParams.get("destination"), "Rua A & B, 10, Belo Horizonte");
  assert.equal(url.searchParams.get("api"), "1");
  assert.equal(url.searchParams.has("key"), false);
});
test("delivery markers use stored valid coordinates without inventing a location", () => {
  assert.deepEqual(deliveryPoint({ lat: "-19.9", lng: "-43.9" }), { lat: -19.9, lng: -43.9 });
  assert.equal(deliveryPoint({}), null);
  assert.equal(deliveryPoint({ lat: null, lng: null }), null);
  assert.equal(deliveryPoint({ lat: 0, lng: 0 }), null);
});
test("straight-line distance stays a distance estimate, without a routing API", () => {
  assert.equal(haversineKm({ lat: -19.9, lng: -43.9 }, { lat: -19.9, lng: -43.9 }), 0);
  assert.ok(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) > 110);
});

test("markers arriving after GPS get a new viewport, subsequent GPS movement preserves it", () => {
  const gps = { lat: -23.55, lng: -46.63 };
  const store = { id: "store", lat: -19.9, lng: -43.9 };
  const initial = mapViewportKey([], gps);
  const loaded = mapViewportKey([store], gps);
  assert.notEqual(initial, loaded);
  assert.equal(loaded, mapViewportKey([store], { lat: -23.56, lng: -46.64 }));
  assert.equal(mapViewportKey([], null), null);
});
