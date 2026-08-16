import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type EstabRow = {
  id: string;
  nome: string;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

async function geocodeOne(query: string): Promise<{ lat: number; lng: number } | null> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmapsKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!lovableKey || !gmapsKey) return null;
  const url = `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(query)}&region=br&language=pt-BR`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gmapsKey,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Google Geocoding failed [${res.status}]: ${body}`);
    return null;
  }
  const json = (await res.json()) as {
    status: string;
    results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
  };
  if (json.status !== "OK" || !json.results?.length) return null;
  const loc = json.results[0].geometry?.location;
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return null;
  return { lat: loc.lat, lng: loc.lng };
}

export const geocodeMissingEstablishments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("establishments")
      .select("id,nome,endereco,cidade,estado")
      .eq("status", "aprovado")
      .or("lat.is.null,lng.is.null");
    if (error) throw error;

    const list = (rows ?? []) as EstabRow[];
    let ok = 0;
    const fails: { id: string; nome: string; motivo: string }[] = [];

    for (const e of list) {
      const parts = [e.endereco, e.cidade, e.estado, "Brasil"].filter(Boolean).join(", ");
      const primary = parts.trim();
      const fallback = [e.cidade, e.estado, "Brasil"].filter(Boolean).join(", ").trim();
      let coords = primary ? await geocodeOne(primary) : null;
      if (!coords && fallback && fallback !== primary) {
        coords = await geocodeOne(fallback);
      }
      if (!coords) {
        fails.push({
          id: e.id,
          nome: e.nome,
          motivo: primary ? "endereço não localizado" : "sem endereço",
        });
      } else {
        const { error: upErr } = await supabaseAdmin
          .from("establishments")
          .update({ lat: coords.lat, lng: coords.lng })
          .eq("id", e.id);
        if (upErr) fails.push({ id: e.id, nome: e.nome, motivo: upErr.message });
        else ok += 1;
      }
    }

    return { atualizados: ok, total: list.length, falhas: fails };
  });
