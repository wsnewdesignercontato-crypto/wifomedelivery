import test from "node:test";
import assert from "node:assert/strict";
import { geocodeAddress, reverseGeocodeCoordinates } from "../src/lib/geocoding.server.ts";

const apiKey = "isolated-server-test-key";
const location = { lat: -19.9191, lng: -43.9386 };
const geometryResponse = { status: "OK", results: [{ geometry: { location } }] };

test("a valid address resolves coordinates through the direct Google endpoint", async () => {
  const result = await geocodeAddress("Rua A, Belo Horizonte", {
    apiKey,
    fetch: async (input, init) => {
      const url = new URL(input);
      assert.equal(url.origin, "https://maps.googleapis.com");
      assert.equal(url.pathname, "/maps/api/geocode/json");
      assert.equal(url.searchParams.get("address"), "Rua A, Belo Horizonte");
      assert.equal(url.searchParams.get("key"), apiKey);
      assert.ok(init.signal instanceof AbortSignal);
      return Response.json(geometryResponse);
    },
  });
  assert.deepEqual(result, { lat: -19.9191, lng: -43.9386 });
});

for (const cityType of ["administrative_area_level_2", "locality"]) {
  test(`reverse lookup reads city from ${cityType}`, async () => {
    const result = await reverseGeocodeCoordinates(-19.9191, -43.9386, {
      apiKey,
      fetch: async () =>
        Response.json({
          status: "OK",
          results: [
            {
              geometry: { location },
              address_components: [
                {
                  long_name: "Belo Horizonte",
                  short_name: "Belo Horizonte",
                  types: [cityType, "political"],
                },
                {
                  long_name: "Minas Gerais",
                  short_name: "MG",
                  types: ["administrative_area_level_1", "political"],
                },
              ],
            },
          ],
        }),
    });
    assert.deepEqual(result, { cidade: "Belo Horizonte", estado: "MG" });
  });
}

test("missing credentials do not make a provider request", async () => {
  let requested = false;
  assert.equal(
    await geocodeAddress("Rua A", {
      apiKey: "",
      fetch: async () => {
        requested = true;
        return Response.json(geometryResponse);
      },
    }),
    null,
  );
  assert.equal(requested, false);
});

test("invalid coordinates do not make a provider request", async () => {
  let requested = false;
  for (const [lat, lng] of [
    [91, 0],
    [0, 181],
    [NaN, 0],
    [0, Infinity],
  ]) {
    assert.equal(
      await reverseGeocodeCoordinates(lat, lng, {
        apiKey,
        fetch: async () => {
          requested = true;
          return Response.json(geometryResponse);
        },
      }),
      null,
    );
  }
  assert.equal(requested, false);
});

for (const status of [429, 500]) {
  test(`HTTP ${status} leaves geocoding unavailable without throwing`, async () => {
    assert.equal(
      await geocodeAddress("Rua A", {
        apiKey,
        fetch: async () => new Response("provider unavailable", { status }),
      }),
      null,
    );
  });
}

test("a Google denied response does not expose provider details", async () => {
  assert.equal(
    await geocodeAddress("Rua A", {
      apiKey,
      fetch: async () =>
        Response.json({ status: "REQUEST_DENIED", error_message: apiKey, results: [] }),
    }),
    null,
  );
});

test("malformed JSON is a controlled unavailable result", async () => {
  assert.equal(
    await geocodeAddress("Rua A", {
      apiKey,
      fetch: async () => new Response("{invalid"),
    }),
    null,
  );
});

test("provider timeouts do not disclose credentials or interrupt the app", async () => {
  assert.equal(
    await geocodeAddress("Rua A", {
      apiKey,
      fetch: async () => {
        throw new DOMException(apiKey, "TimeoutError");
      },
    }),
    null,
  );
});

test("out-of-range provider coordinates are rejected", async () => {
  assert.equal(
    await geocodeAddress("Rua A", {
      apiKey,
      fetch: async () =>
        Response.json({
          status: "OK",
          results: [{ geometry: { location: { lat: 100, lng: 0 } } }],
        }),
    }),
    null,
  );
});
