import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AvailableCourier = {
  user_id: string;
  veiculo: string | null;
  avaliacao: number | null;
  lat: number | null;
  lng: number | null;
  last_seen: string | null;
};

export const listAvailableCouriers = createServerFn({ method: "POST" }).handler(
  async (): Promise<AvailableCourier[]> => {
    const authHeader = getRequestHeader("authorization");
    if (!authHeader?.startsWith("Bearer ")) return [];
    const token = authHeader.slice(7);
    if (token.split(".").length !== 3) return [];

    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const userClient = createClient<Database>(url, key, {
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          h.set("Authorization", `Bearer ${token}`);
          return fetch(input, { ...init, headers: h });
        },
      },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data: claims } = await userClient.auth.getClaims(token);
    const userId = claims?.claims?.sub;
    if (!userId) return [];

    const { data: roles } = await userClient.from("user_roles").select("role").eq("user_id", userId);
    const allowed = (roles ?? []).some((r) => r.role === "admin" || r.role === "estabelecimento");
    if (!allowed) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("courier_profiles")
      .select("user_id, veiculo, avaliacao, lat, lng, last_seen")
      .eq("status", "online")
      .eq("aprovacao", "approved");
    if (error) throw new Error(error.message);
    return (data ?? []) as AvailableCourier[];
  },
);
