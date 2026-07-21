import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type EstabRow = {
  id: string;
  nome: string;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
};

async function geocodeOne(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "WiFome-Admin/1.0 (contato@wifome.app)",
      "Accept-Language": "pt-BR",
    },
  });
  if (!res.ok) return null;
  const arr = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!arr.length) return null;
  const lat = Number(arr[0].lat);
  const lng = Number(arr[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export const geocodeMissingEstablishments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await (
      context.supabase as unknown as {
        rpc: (n: string, p: unknown) => Promise<{ data: boolean }>;
      }
    ).rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

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
        await new Promise((r) => setTimeout(r, 1100)); // respeitar rate limit Nominatim (1 req/s)
        coords = await geocodeOne(fallback);
      }
      if (!coords) {
        fails.push({ id: e.id, nome: e.nome, motivo: primary ? "endereço não localizado" : "sem endereço" });
      } else {
        const { error: upErr } = await supabaseAdmin
          .from("establishments")
          .update({ lat: coords.lat, lng: coords.lng })
          .eq("id", e.id);
        if (upErr) fails.push({ id: e.id, nome: e.nome, motivo: upErr.message });
        else ok += 1;
      }
      // Rate limit 1 req/s
      await new Promise((r) => setTimeout(r, 1100));
    }

    return { atualizados: ok, total: list.length, falhas: fails };
  });
