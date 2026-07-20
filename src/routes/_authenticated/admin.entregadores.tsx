import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Bike, Ban, CheckCircle2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/entregadores")({
  component: EntregadoresPage,
});

type Courier = {
  user_id: string;
  veiculo: string | null;
  placa: string | null;
  status: string;
  cnh: string | null;
  last_seen: string | null;
};

type CourierRow = Courier & {
  nome: string | null;
  telefone: string | null;
};

async function fetchCouriers(): Promise<CourierRow[]> {
  const { data, error } = await supabase
    .from("courier_profiles")
    .select("user_id,veiculo,placa,status,cnh,last_seen");
  if (error) throw error;
  const list = (data ?? []) as Courier[];
  if (list.length === 0) return [];
  const ids = list.map((c) => c.user_id);
  const { data: profs } = await supabase
    .from("profiles")
    .select("id,nome,telefone")
    .in("id", ids);
  const profMap = new Map(
    ((profs ?? []) as { id: string; nome: string | null; telefone: string | null }[]).map((p) => [
      p.id,
      p,
    ]),
  );
  return list.map((c) => ({
    ...c,
    nome: profMap.get(c.user_id)?.nome ?? null,
    telefone: profMap.get(c.user_id)?.telefone ?? null,
  }));
}

function EntregadoresPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "online" | "offline" | "ocupado">("all");
  const { data, isLoading } = useQuery({ queryKey: ["admin-couriers"], queryFn: fetchCouriers });
  const qc = useQueryClient();

  const filtered = (data ?? []).filter((c) => {
    if (q && !(c.nome ?? "").toLowerCase().includes(q.toLowerCase())) return false;
    if (filter !== "all" && c.status !== filter) return false;
    return true;
  });

  async function setStatus(userId: string, newStatus: "offline" | "online") {
    const { error } = await supabase
      .from("courier_profiles")
      .update({ status: newStatus })
      .eq("user_id", userId);
    if (error) return toast.error("Falha ao atualizar");
    toast.success(newStatus === "offline" ? "Entregador desconectado" : "Entregador reativado");
    await supabase.from("admin_audit_log").insert({
      admin_id: (await supabase.auth.getUser()).data.user!.id,
      action: `courier_set_${newStatus}`,
      entity_type: "courier",
      entity_id: userId,
    });
    qc.invalidateQueries({ queryKey: ["admin-couriers"] });
  }

  const statusPill: Record<string, string> = {
    online: "bg-emerald-500/10 text-emerald-600",
    offline: "bg-muted text-muted-foreground",
    ocupado: "bg-amber-500/10 text-amber-600",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Bike className="h-6 w-6 text-primary" /> Entregadores
          </h1>
          <p className="text-sm text-muted-foreground">{data?.length ?? 0} entregador(es).</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="w-64 pl-9" />
          </div>
          <div className="flex overflow-hidden rounded-lg border border-border bg-card">
            {(["all", "online", "ocupado", "offline"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`px-3 py-2 text-xs font-medium ${
                  filter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {k === "all" ? "Todos" : k[0].toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Entregador</th>
                <th className="px-4 py-3">Veículo</th>
                <th className="px-4 py-3">CNH</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-4 py-3">
                      <div className="h-8 animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhum entregador.
                  </td>
                </tr>
              )}
              {filtered.map((c) => (
                <tr key={c.user_id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.nome || "Sem nome"}</p>
                    <p className="text-xs text-muted-foreground">{c.telefone || "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.veiculo ?? "—"} {c.placa ? `· ${c.placa}` : ""}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.cnh ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusPill[c.status] ?? "bg-muted"}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.status === "offline" ? (
                      <Button size="sm" variant="outline" onClick={() => setStatus(c.user_id, "online")}>
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Ativar
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="text-rose-600" onClick={() => setStatus(c.user_id, "offline")}>
                        <Ban className="mr-1.5 h-3.5 w-3.5" /> Desconectar
                      </Button>
                    )}
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
