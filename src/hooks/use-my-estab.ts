import { useRouteContext } from "@tanstack/react-router";
import { useEstab, type Estab } from "@/hooks/use-estab";

export function useMyEstab(): { estab: Estab | null; userId: string; isLoading: boolean } {
  const ctx = useRouteContext({ from: "/_authenticated" }) as { user: { id: string } };
  const { data, isLoading } = useEstab(ctx.user.id);
  return { estab: data ?? null, userId: ctx.user.id, isLoading };
}

export const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
