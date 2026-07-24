import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Shield, TrendingDown } from "lucide-react";

type Props = {
  entityType: "establishment" | "courier";
  entityId: string;
};

type Evt = { id: string; ym: string; penalty: number; motivo: string; created_at: string };

export function ScoreCard({ entityType, entityId }: Props) {
  const [score, setScore] = useState<number>(100);
  const [ym, setYm] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [events, setEvents] = useState<Evt[]>([]);

  useEffect(() => {
    if (!entityId) return;
    (async () => {
      const cur = new Date().toISOString().slice(0, 7);
      if (entityType === "establishment") {
        const { data } = await supabase
          .from("establishments")
          .select("score_mensal,score_ym")
          .eq("id", entityId)
          .maybeSingle();
        const s = data?.score_ym === cur ? Number(data?.score_mensal ?? 100) : 100;
        setScore(s);
        setYm(cur);
      } else {
        const { data } = await supabase
          .from("courier_profiles")
          .select("score_mensal,score_ym")
          .eq("user_id", entityId)
          .maybeSingle();
        const s = data?.score_ym === cur ? Number(data?.score_mensal ?? 100) : 100;
        setScore(s);
        setYm(cur);
      }
      const { data: evs } = await supabase
        .from("score_events")
        .select("id,ym,penalty,motivo,created_at")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("ym", cur)
        .order("created_at", { ascending: false })
        .limit(5);
      setEvents((evs ?? []) as Evt[]);
    })();
  }, [entityType, entityId]);

  const color =
    score >= 85 ? "text-emerald-500" : score >= 60 ? "text-amber-500" : "text-destructive";
  const bar =
    score >= 85 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-destructive";
  const label =
    score >= 85 ? "Excelente" : score >= 60 ? "Atenção" : "Crítico";

  const [y, m] = ym.split("-");
  const mesNome = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className={`h-5 w-5 ${color}`} />
          <div>
            <p className="text-sm font-semibold">Score mensal de qualidade</p>
            <p className="text-xs capitalize text-muted-foreground">{mesNome}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-3xl font-black leading-none ${color}`}>{score}</p>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${color}`}>{label}</p>
        </div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${bar} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Começa em 100 todo mês. Perde pontos com atrasos na entrega e avaliações baixas.
      </p>
      {events.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-border pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Últimas perdas
          </p>
          {events.map((e) => (
            <div key={e.id} className="flex items-start justify-between gap-2 text-xs">
              <span className="flex items-start gap-1.5 text-muted-foreground">
                <TrendingDown className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                {e.motivo}
              </span>
              <span className="shrink-0 font-bold text-destructive">−{e.penalty}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
