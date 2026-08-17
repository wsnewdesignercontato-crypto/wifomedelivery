import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { dateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/logs")({
  component: LogsPage,
});

type Log = {
  id: string;
  admin_id: string;
  admin_nome: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
};

async function fetchLogs() {
  const { data, error } = await (supabase as any)
    .from("vw_admin_audit_logs")
    .select("id,admin_id,admin_nome,action,entity_type,entity_id,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as any as Log[];
}

function LogsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["admin-logs"], queryFn: fetchLogs });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ScrollText className="h-6 w-6 text-primary" /> Logs & Auditoria
        </h1>
        <p className="text-sm text-muted-foreground">
          Todas as ações administrativas ficam registradas aqui.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Quando</th>
                <th className="px-4 py-3">Admin</th>
                <th className="px-4 py-3">Ação</th>
                <th className="px-4 py-3">Entidade</th>
                <th className="px-4 py-3">ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={4} className="px-4 py-3">
                      <div className="h-6 animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))}
              {!isLoading && (data ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhum log ainda.
                  </td>
                </tr>
              )}
              {(data ?? []).map((l) => (
                <tr key={l.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 text-muted-foreground">{dateTime(l.created_at)}</td>
                  <td className="px-4 py-3 font-medium">
                    {l.admin_nome || "Sistema"}
                    <span className="ml-2 text-[10px] text-muted-foreground font-mono">
                      ({l.admin_id.slice(0, 6)})
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {l.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{l.entity_type}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                    {l.entity_id?.slice(0, 12) ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
