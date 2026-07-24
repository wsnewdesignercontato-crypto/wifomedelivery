import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronUp, History, Shield, TrendingDown } from "lucide-react";

type Props = {
  entityType: "establishment" | "courier";
  entityId: string;
};

type Evt = {
  id: string;
  ym: string;
  penalty: number;
  motivo: string;
  created_at: string;
  order_id: string | null;
};

function categorize(motivo: string): { label: string; tone: string } {
  const m = motivo.toLowerCase();
  if (m.includes("atraso")) return { label: "Atraso na entrega", tone: "bg-amber-500/10 text-amber-600" };
  if (m.includes("avaliação") || m.includes("avaliacao"))
    return { label: "Avaliação baixa", tone: "bg-destructive/10 text-destructive" };
  return { label: "Outros", tone: "bg-muted text-muted-foreground" };
}

export function ScoreCard({ entityType, entityId }: Props) {
  const [score, setScore] = useState<number>(100);
  const [ym, setYm] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [events, setEvents] = useState<Evt[]>([]);
  const [expanded, setExpanded] = useState(false);

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
        .select("id,ym,penalty,motivo,created_at,order_id")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("ym", cur)
        .order("created_at", { ascending: false });
      setEvents((evs ?? []) as Evt[]);
    })();
  }, [entityType, entityId]);

  const color =
    score >= 85 ? "text-emerald-500" : score >= 60 ? "text-amber-500" : "text-destructive";
  const bar =
    score >= 85 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-destructive";
  const label = score >= 85 ? "Excelente" : score >= 60 ? "Atenção" : "Crítico";

  const [y, m] = ym.split("-");
  const mesNome = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const summary = useMemo(() => {
    const map = new Map<string, { label: string; tone: string; total: number; count: number }>();
    for (const e of events) {
      const c = categorize(e.motivo);
      const cur = map.get(c.label) ?? { label: c.label, tone: c.tone, total: 0, count: 0 };
      cur.total += e.penalty;
      cur.count += 1;
      map.set(c.label, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [events]);

  const totalPerdido = events.reduce((s, e) => s + e.penalty, 0);
  const visibleEvents = expanded ? events : events.slice(0, 5);

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

      {summary.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-3">
          {summary.map((s) => (
            <div key={s.label} className={`rounded-lg px-2 py-1.5 ${s.tone}`}>
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{s.label}</p>
              <p className="text-sm font-black leading-tight">−{s.total} pts</p>
              <p className="text-[10px] opacity-70">{s.count} evento{s.count > 1 ? "s" : ""}</p>
            </div>
          ))}
          <div className="rounded-lg bg-muted/60 px-2 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total do mês</p>
            <p className="text-sm font-black leading-tight text-destructive">−{totalPerdido} pts</p>
            <p className="text-[10px] text-muted-foreground">{events.length} no total</p>
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-border pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Histórico de perdas
          </p>
          {visibleEvents.map((e) => {
            const dt = new Date(e.created_at).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <div key={e.id} className="flex items-start justify-between gap-2 text-xs">
                <span className="flex items-start gap-1.5 text-muted-foreground">
                  <TrendingDown className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                  <span>
                    <span className="block">{e.motivo}</span>
                    <span className="block text-[10px] opacity-70">
                      {dt}
                      {e.order_id ? ` · pedido #${e.order_id.slice(0, 6)}` : ""}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 font-bold text-destructive">−{e.penalty}</span>
              </div>
            );
          })}
          {events.length > 5 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 flex w-full items-center justify-center gap-1 rounded-md bg-muted/60 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted"
            >
              {expanded ? (
                <>
                  Recolher <ChevronUp className="h-3 w-3" />
                </>
              ) : (
                <>
                  Ver todos ({events.length}) <ChevronDown className="h-3 w-3" />
                </>
              )}
            </button>
          )}
        </div>
      )}

      {events.length === 0 && (
        <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3 text-center">
          <p className="text-xs font-semibold text-emerald-600">Sem penalidades neste mês 🎉</p>
          <p className="text-[11px] text-muted-foreground">Continue entregando com qualidade!</p>
        </div>
      )}

      <Link
        to={entityType === "establishment" ? "/estabelecimento/score" : "/entregador/score"}
        className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/40 py-2 text-[11px] font-semibold text-muted-foreground hover:bg-muted"
      >
        <History className="h-3.5 w-3.5" /> Ver histórico completo e notificações
      </Link>
    </div>
  );
}
