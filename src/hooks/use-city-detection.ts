import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Detected = {
  cidade: string;
  estado: string;
  differsFromActive: boolean;
  hasEstabsHere: boolean;
} | null;

type GoogleAddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

type GoogleGeocodeResponse = {
  results?: Array<{
    address_components?: GoogleAddressComponent[];
  }>;
};

type NominatimResponse = {
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state_code?: string;
    state?: string;
  };
};

const SESSION_KEY = "wifome:city-detected-once";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

function norm(s: string | null | undefined) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ cidade: string; estado: string } | null> {
  try {
    const lovableKey = import.meta.env.VITE_LOVABLE_API_KEY;
    // Use gateway com key do Google Maps (não precisamos passar a browser key aqui — usaremos Nominatim como fallback)
    if (lovableKey) {
      const res = await fetch(
        `${GATEWAY_URL}/maps/api/geocode/json?latlng=${lat},${lng}&language=pt-BR&region=br`,
        { headers: { Authorization: `Bearer ${lovableKey}` } },
      );
      if (res.ok) {
        const data = (await res.json()) as GoogleGeocodeResponse;
        const comps = data.results?.[0]?.address_components ?? [];
        const cidade =
          comps.find((c) => c.types?.includes("administrative_area_level_2"))?.long_name ??
          comps.find((c) => c.types?.includes("locality"))?.long_name ??
          "";
        const estado =
          comps.find((c) => c.types?.includes("administrative_area_level_1"))?.short_name ?? "";
        if (cidade) return { cidade, estado };
      }
    }
    // Fallback Nominatim
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pt-BR`,
    );
    if (!r.ok) return null;
    const d = (await r.json()) as NominatimResponse;
    const cidade =
      d?.address?.city ?? d?.address?.town ?? d?.address?.village ?? d?.address?.municipality ?? "";
    const estado = (d?.address?.state_code ?? d?.address?.state ?? "").slice(0, 2).toUpperCase();
    return cidade ? { cidade, estado } : null;
  } catch {
    return null;
  }
}

export function useCityDetection(activeCidade: string | null, activeEstado: string | null) {
  const [detected, setDetected] = useState<Detected>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        sessionStorage.setItem(SESSION_KEY, "1");
        const geo = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        if (!geo) return;

        const differs = norm(geo.cidade) !== norm(activeCidade ?? "");
        if (!differs) return;

        // Só notifica se existem estabelecimentos na cidade detectada
        const { count } = await supabase
          .from("establishments")
          .select("id", { count: "exact", head: true })
          .ilike("cidade", geo.cidade)
          .eq("status", "aprovado");

        setDetected({
          cidade: geo.cidade,
          estado: geo.estado,
          differsFromActive: true,
          hasEstabsHere: (count ?? 0) > 0,
        });
      },
      () => {
        sessionStorage.setItem(SESSION_KEY, "1");
      },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 },
    );
  }, [activeCidade, activeEstado]);

  return { detected, dismiss: () => setDetected(null) };
}
