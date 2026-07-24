import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Shield, TrendingDown, Bell, Calendar } from "lucide-react";

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

type Notif = {
  id: string;
  titulo: string;
  mensagem: string;
  created_at: string;
};

const START = 100;

function bandFromScore(s: number) {
  if (s >= 85) return { label: "Excelente", tone: "text-emerald-500", bar: "bg-emerald-500" };
  if (s >= 60) return { label: "Atenção", tone: "text-amber-500", bar: "bg-amber-500" };
  return { label: "Crítico", tone: "text-destructive", bar: "bg-destructive" };
}

export function ScoreHistory({ entityType, entityId }: Props) {
  const [events, setEvents] = useState<Evt[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  useEffect(() => {
    if (!entityId) return;
    (async () => {
      const { data: evs } = await supabase
        .from("score_events")
        .select("id,ym,penalty,motivo,created_at,order_id")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .limit(500);
      setEvents((evs ?? []) as Evt[]);

      let uid = entityId;
      if (entityType === "establishment") {
        const { data } = await supabase
          .from("establishments")
          .select("owner_id")
          .eq("id", entityId)
          .maybeSingle();
        uid = data?.owner_id ?? entityId;
      }
      setOwnerId(uid);

      const { data: nfs } = await supabase
        .from("notifications")
        .select("id,titulo,mensagem,created_at")
        .eq("user_id", uid)
        .or("titulo.ilike.%score%,mensagem.ilike.%score%")
        .order("created_at", { ascending: false })
        .limit(100);
      setNotifs((nfs ?? []) as Notif[]);
    })();
  }, [entityType, entityId]);

  // Reconstruir score corrente por mês a partir dos eventos (100 - soma penalidades do mês)
  const byMonth = useMemo(() => {
    const map = new Map<string, Evt[]>();
    for (const e of events) {
      const arr = map.get(e.ym) ?? [];
      arr.push(e);
      map.set(e.ym, arr);
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([ym, list]) => {
        const total = list.reduce((s, e) => s + e.penalty, 0);
        const finalScore = Math.max(0, START - total);
        return { ym, events: list, total, finalScore };
      });
  }, [events]);

  // Cruzar notificação com o evento mais próximo (mesmo timestamp aproximado)
  const notifRows = useMemo(() => {
    return notifs.map((n) => {
      const ts = new Date(n.created_at).getTime();
      let closest: Evt | null = null;
      let bestDiff = Infinity;
      for (const e of events) {
        const d = Math.abs(new Date(e.created_at).getTime() - ts);
        if (d < bestDiff && d < 60_000) {
          bestDiff = d;
          closest = e;
        }
      }
      // score novo no momento da notificação = 100 - soma das penalidades do mesmo mês até aquele instante
      let novoScore: number | null = null;
      if (closest) {
        const monthEvents = events
          .filter((e) => e.ym === closest!.ym)
          .filter((e) => new Date(e.created_at).getTime() <= ts + 500)
          .reduce((s, e) => s + e.penalty, 0);
        novoScore = Math.max(0, START - monthEvents);
      }
      return { notif: n, evt: closest, novoScore };
    });
  }, [notifs, events]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-black tracking-tight">Histórico do Score</h1>
          <p className="text-xs text-muted-foreground">
            Notificações e eventos que afetaram seu score mensal.
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold">Notificações do score</h2>
        </div>
        {notifRows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
            Nenhuma notificação de score até agora. Continue com boas entregas!
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {notifRows.map(({ notif, evt, novoScore }) => {
              const dt = new Date(notif.created_at).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
              const band = novoScore != null ? bandFromScore(novoScore) : null;
              return (
                <li key={notif.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{notif.titulo}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{notif.mensagem}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{dt}</p>
                      {evt && (
                        <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                          <TrendingDown className="h-3 w-3" /> {evt.motivo} · −{evt.penalty} pts
                        </p>
                      )}
                    </div>
                    {novoScore != null && band && (
                      <div className="shrink-0 text-right">
                        <p className={`text-2xl font-black leading-none ${band.tone}`}>{novoScore}</p>
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${band.tone}`}>
                          {band.label}
                        </p>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold">Histórico por mês</h2>
        </div>
        {byMonth.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
            Ainda não há eventos de score registrados.
          </p>
        ) : (
          byMonth.map(({ ym, events: list, total, finalScore }) => {
            const [y, m] = ym.split("-");
            const mesNome = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", {
              month: "long",
              year: "numeric",
            });
            const band = bandFromScore(finalScore);
            return (
              <div key={ym} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold capitalize">{mesNome}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {list.length} evento{list.length > 1 ? "s" : ""} · −{total} pts no total
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-black leading-none ${band.tone}`}>{finalScore}</p>
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${band.tone}`}>
                      {band.label}
                    </p>
                  </div>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full ${band.bar}`}
                    style={{ width: `${finalScore}%` }}
                  />
                </div>
                <ul className="mt-3 space-y-1.5">
                  {list.map((e) => {
                    const dt = new Date(e.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    return (
                      <li key={e.id} className="flex items-start justify-between gap-2 text-xs">
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
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
