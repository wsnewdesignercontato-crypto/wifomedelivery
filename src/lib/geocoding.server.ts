type GeocodingOptions = { apiKey?: string; fetch?: typeof fetch };
type GeocodingResponse = {
  status?: string;
  results?: Array<{
    geometry?: { location?: { lat: number; lng: number } };
    address_components?: Array<{ long_name?: string; short_name?: string; types?: string[] }>;
  }>;
};

function validCoordinates(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  );
}

async function requestGeocoding(
  parameters: Record<string, string>,
  options: GeocodingOptions,
): Promise<GeocodingResponse | null> {
  const apiKey = options.apiKey ?? process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey?.trim()) return null;
  const query = new URLSearchParams({
    ...parameters,
    key: apiKey,
    language: "pt-BR",
    region: "br",
  });
  try {
    const response = await (options.fetch ?? fetch)(
      `https://maps.googleapis.com/maps/api/geocode/json?${query}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as GeocodingResponse;
    return data?.status === "OK" && Array.isArray(data.results) ? data : null;
  } catch {
    // Provider errors can contain the credential-bearing URL; never forward them.
    return null;
  }
}

export async function geocodeAddress(
  address: string,
  options: GeocodingOptions = {},
): Promise<{ lat: number; lng: number } | null> {
  if (typeof address !== "string" || !address.trim()) return null;
  const data = await requestGeocoding({ address: address.trim() }, options);
  const location = data?.results?.[0]?.geometry?.location;
  return location && validCoordinates(location.lat, location.lng)
    ? { lat: location.lat, lng: location.lng }
    : null;
}

export async function reverseGeocodeCoordinates(
  lat: number,
  lng: number,
  options: GeocodingOptions = {},
): Promise<{ cidade: string; estado: string } | null> {
  if (!validCoordinates(lat, lng)) return null;
  const data = await requestGeocoding({ latlng: `${lat},${lng}` }, options);
  for (const result of data?.results ?? []) {
    const components = result?.address_components;
    if (!Array.isArray(components)) continue;
    const component = (type: string) =>
      components.find((item) => Array.isArray(item?.types) && item.types.includes(type));
    const cidade =
      component("administrative_area_level_2")?.long_name || component("locality")?.long_name;
    const estado = component("administrative_area_level_1")?.short_name;
    if (typeof cidade === "string" && cidade.trim()) {
      return { cidade: cidade.trim(), estado: typeof estado === "string" ? estado.trim() : "" };
    }
  }
  return null;
}
