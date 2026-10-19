import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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

    const { geocodeStoreAddress } = await import("@/lib/geocoding.server");

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
      const coords =
        e.endereco?.trim() && e.cidade?.trim() ? await geocodeStoreAddress(primary) : null;
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
// Invoker client enforces the existing owner/admin RLS; checked write returns the saved row.
export const saveStoreMapLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      id: z.string().uuid(),
      lat: z.number().finite().min(-34).max(6),
      lng: z.number().finite().min(-74).max(-34),
    }),
  )
  .handler(async ({ context, data }) => {
    const { data: shop, error: readError } = await context.supabase
      .from("establishments")
      .select("id,owner_id")
      .eq("id", data.id)
      .single();
    if (readError || !shop) throw new Error("Estabelecimento não encontrado.");
    if (shop.owner_id !== context.userId) {
      const { data: role, error } = await context.supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .eq("role", "admin")
        .maybeSingle();
      if (error || !role) throw new Error("Acesso não permitido.");
    }
    const { data: saved, error } = await context.supabase
      .from("establishments")
      .update({ lat: data.lat, lng: data.lng })
      .eq("id", data.id)
      .select("id,lat,lng")
      .single();
    if (error || !saved) throw new Error("Não foi possível salvar a localização. Tente novamente.");
    return saved;
  });

export const locateStoreAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const { data: shop, error } = await context.supabase
      .from("establishments")
      .select("id,owner_id,endereco,cidade,estado")
      .eq("id", data.id)
      .single();
    if (error || !shop) throw new Error("Estabelecimento não encontrado.");
    if (shop.owner_id !== context.userId) {
      const { data: role, error: roleError } = await context.supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .eq("role", "admin")
        .maybeSingle();
      if (roleError || !role) throw new Error("Acesso não permitido.");
    }
    if (!shop.endereco?.trim() || !shop.cidade?.trim())
      throw new Error("Salve o endereço completo da loja primeiro.");
    const { geocodeStoreAddress } = await import("@/lib/geocoding.server");
    const point = await geocodeStoreAddress(
      [shop.endereco, shop.cidade, shop.estado, "Brasil"].filter(Boolean).join(", "),
    );
    if (!point)
      throw new Error(
        "Endereço não localizado com precisão. Marque o ponto no mapa ou informe as coordenadas.",
      );
    return point;
  });
