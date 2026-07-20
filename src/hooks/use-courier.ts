import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export type Courier = {
  user_id: string;
  cnh: string | null;
  veiculo: string | null;
  placa: string | null;
  pix_key: string | null;
  status: "pendente" | "aprovado" | "online" | "offline" | "ocupado" | "bloqueado";
  foto_url?: string | null;
  cpf?: string | null;
  rg?: string | null;
  nascimento?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  endereco?: Record<string, unknown> | null;
  contato_emergencia_nome?: string | null;
  contato_emergencia_tel?: string | null;
  cnh_categoria?: string | null;
  cnh_validade?: string | null;
  pix_tipo?: string | null;
  banco_nome?: string | null;
  banco_agencia?: string | null;
  banco_conta?: string | null;
  banco_tipo?: string | null;
  banco_titular?: string | null;
  cidades_atuacao?: string[] | null;
  avaliacao?: number;
  entregas_total?: number;
  aceitacao_pct?: number;
  cancelamento_pct?: number;
  aprovacao?: string;
  kyc_status?: string;
  kyc_motivo?: string | null;
};

export function courierQueryOptions(userId: string) {
  return {
    queryKey: ["courier", userId] as const,
    queryFn: async (): Promise<Courier | null> => {
      const { data } = await supabase
        .from("courier_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      return (data as unknown as Courier) ?? null;
    },
    staleTime: 15_000,
  };
}

export function useMyCourier(): { courier: Courier | null; userId: string; isLoading: boolean } {
  const ctx = useRouteContext({ from: "/_authenticated" }) as { user: { id: string } };
  const q = useQuery(courierQueryOptions(ctx.user.id));
  return { courier: q.data ?? null, userId: ctx.user.id, isLoading: q.isLoading };
}

export const fmt = (c: number) =>
  ((c ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
