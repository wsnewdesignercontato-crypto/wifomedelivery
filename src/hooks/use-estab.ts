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
  cidade: string | null;
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
};

export function myEstabQueryOptions(userId: string) {
  return {
    queryKey: ["myEstab", userId] as const,
    queryFn: async (): Promise<Estab | null> => {
      const { data } = await supabase
        .from("establishments")
        .select("*")
        .eq("owner_id", userId)
        .maybeSingle();
      return (data as unknown as Estab) ?? null;
    },
    staleTime: 30_000,
  };
}

export function useEstab(userId: string) {
  return useQuery(myEstabQueryOptions(userId));
}
