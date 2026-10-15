import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const reverseGeocodeCity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Coordenadas inválidas.");
    const { lat, lng } = input as { lat?: unknown; lng?: unknown };
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    )
      throw new Error("Coordenadas inválidas.");
    return { lat, lng };
  })
  .handler(async ({ data }) => {
    const { reverseGeocodeCoordinates } = await import("@/lib/geocoding.server");
    return reverseGeocodeCoordinates(data.lat, data.lng);
  });
