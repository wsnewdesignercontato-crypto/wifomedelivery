import { ESTABLISHMENT_SELECT } from "@/lib/data-access";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Estab = {
  id: string;
  owner_id: string;
  nome: string;
  descricao: string | null;
  telefone: string | null;
  categoria_id: string | null;
  endereco: string | null;
  lat?: number | null;
  lng?: number | null;
  cidade: string | null;
  estado: string | null;
  taxa_entrega_cents: number;
  tempo_medio_min: number | null;
  pedido_minimo_cents: number;
  is_open: boolean;
  status: string;
  logo_url?: string | null;
  capa_url?: string | null;
  whatsapp?: string | null;
  pix_key?: string | null;
  cnpj?: string | null;
  razao_social?: string | null;
  slogan?: string | null;
  instagram?: string | null;
  site?: string | null;
  cor_destaque?: string | null;
  tipos?: string[] | null;
  banco_nome?: string | null;
  banco_agencia?: string | null;
  banco_conta?: string | null;
  banco_tipo?: string | null;
  banco_titular?: string | null;
  banco_documento?: string | null;
  printer_enabled?: boolean | null;
  printer_auto?: boolean | null;
  printer_width_mm?: number | null;
};

export function myEstabQueryOptions(userId: string) {
  return {
    queryKey: ["myEstab", userId] as const,
    queryFn: async (): Promise<Estab | null> => {
      const { data, error } = await supabase
        .from("establishments")
        .select(ESTABLISHMENT_SELECT)
        .eq("owner_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: privateData, error: privateError } = await supabase.rpc(
        "get_establishment_private",
        { p_establishment_id: data.id },
      );
      if (privateError) throw privateError;
      return { ...data, ...(privateData as Record<string, unknown>) } as unknown as Estab;
    },
    staleTime: 30_000,
  };
}

export function useEstab(userId: string) {
  return useQuery(myEstabQueryOptions(userId));
}
