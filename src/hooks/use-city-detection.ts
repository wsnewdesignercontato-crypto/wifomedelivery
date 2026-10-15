import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { reverseGeocodeCity } from "@/lib/location.functions";

type Detected = {
  cidade: string;
  estado: string;
  differsFromActive: boolean;
  hasEstabsHere: boolean;
} | null;

const SESSION_KEY = "wifome:city-detected-once";

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
    return await reverseGeocodeCity({ data: { lat, lng } });
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
