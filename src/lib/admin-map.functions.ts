import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type EstabRow = {
  id: string;
  nome: string;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
};

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

    const { geocodeAddress } = await import("@/lib/geocoding.server");

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
      let coords = primary ? await geocodeAddress(primary) : null;
      if (!coords && fallback && fallback !== primary) {
        coords = await geocodeAddress(fallback);
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
