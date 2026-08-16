import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { useMyCourier, fmt } from "@/hooks/use-courier";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/entregador/metas")({
  component: Metas,
});

type Mission = {
  id: string;
  titulo: string;
  descricao: string | null;
  meta_entregas: number;
  progresso: number;
  bonus_cents: number;
  periodo_inicio: string;
  periodo_fim: string | null;
  status: string;
};

function Metas() {
  const { courier } = useMyCourier();
  const [missions, setMissions] = useState<Mission[]>([]);

  useEffect(() => {
    if (!courier) return;
    supabase
      .from("courier_missions")
      .select("*")
      .eq("courier_id", courier.user_id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setMissions((data ?? []) as Mission[]));
  }, [courier]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Metas & Campanhas</h1>
      {missions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Trophy className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhuma meta ativa. Novas campanhas aparecem aqui.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {missions.map((m) => {
            const pct = m.meta_entregas ? Math.min(100, (m.progresso / m.meta_entregas) * 100) : 0;
            return (
              <div key={m.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold">{m.titulo}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{m.descricao}</p>
                  </div>
                  <Badge>{m.status}</Badge>
                </div>
                <div className="mt-3">
                  <div className="h-2 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      {m.progresso} / {m.meta_entregas} entregas
                    </span>
                    <span className="font-bold text-primary">Bônus {fmt(m.bonus_cents)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
