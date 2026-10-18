import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
export type GlobalNiche = { id: string; nome: string; slug: string; icone: string | null };
export function useNicheCatalog() {
  return useQuery({
    queryKey: ["deliveryNicheCatalog"],
    staleTime: 300000,
    queryFn: async (): Promise<GlobalNiche[]> => {
      const { data, error } = await supabase
        .from("global_categories")
        .select("id,nome,slug,icone")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });
}
