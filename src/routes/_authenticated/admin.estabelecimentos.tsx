import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Store, Ban, CheckCircle2, Star, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/estabelecimentos")({
  component: EstabsPage,
});

type Estab = {
  id: string;
  nome: string;
  categoria_id: string | null;
  is_open: boolean;
  status: string;
  avaliacao: number | null;
  tempo_medio_min: number | null;
  taxa_entrega_cents: number | null;
  logo_url: string | null;
  cidade: string | null;
  estado: string | null;
};

async function fetchEstabs() {
  const { data, error } = await supabase
    .from("establishments")
    .select("id,nome,categoria_id,is_open,status,avaliacao,tempo_medio_min,taxa_entrega_cents,logo_url,cidade,estado")
    .order("nome");
  if (error) throw error;
  return (data ?? []) as Estab[];
}

function EstabsPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "aberto" | "fechado" | "bloqueado">("all");
  const { data, isLoading } = useQuery({ queryKey: ["admin-estabs"], queryFn: fetchEstabs });
  const qc = useQueryClient();

  const filtered = (data ?? []).filter((e) => {
    if (q && !e.nome.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "aberto") return e.is_open && e.status !== "bloqueado";
    if (filter === "fechado") return !e.is_open && e.status !== "bloqueado";
    if (filter === "bloqueado") return e.status === "bloqueado";
    return true;
  });

  async function setStatus(id: string, status: "aprovado" | "bloqueado") {
    const { error } = await supabase.from("establishments").update({ status }).eq("id", id);
    if (error) return toast.error("Falha ao atualizar");
    toast.success(status === "bloqueado" ? "Bloqueado" : "Aprovado");
    await supabase.from("admin_audit_log").insert({
      admin_id: (await supabase.auth.getUser()).data.user!.id,
      action: `estab_${status}`,
      entity_type: "establishment",
      entity_id: id,
    });
    qc.invalidateQueries({ queryKey: ["admin-estabs"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Store className="h-6 w-6 text-primary" /> Estabelecimentos
          </h1>
          <p className="text-sm text-muted-foreground">{data?.length ?? 0} loja(s).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="w-64 pl-9" />
          </div>
          <div className="flex overflow-hidden rounded-lg border border-border bg-card">
            {(["all", "aberto", "fechado", "bloqueado"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  filter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {k === "all" ? "Todos" : k[0].toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />
          ))}
        {filtered.map((e) => (
          <div
            key={e.id}
            className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
                {e.logo_url ? (
                  <img src={e.logo_url} alt={e.nome} className="h-full w-full object-cover" />
                ) : (
                  <Store className="h-6 w-6 text-primary" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold text-foreground">{e.nome}</h3>
                <p className="truncate text-xs text-muted-foreground">
                  {e.categoria_id ?? "—"} · {e.cidade ?? "—"}/{e.estado ?? "—"}
                </p>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3 w-3 text-amber-500" /> {e.avaliacao?.toFixed(1) ?? "—"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {e.tempo_medio_min ?? "—"} min
                  </span>
                  <span>{brl(e.taxa_entrega_cents ?? 0)}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    e.status === "bloqueado"
                      ? "bg-rose-500/10 text-rose-600"
                      : e.is_open
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {e.status === "bloqueado" ? "Bloqueado" : e.is_open ? "Aberto" : "Fechado"}
                </span>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              {e.status === "bloqueado" ? (
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setStatus(e.id, "aprovado")}>
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Desbloquear
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-rose-600"
                  onClick={() => setStatus(e.id, "bloqueado")}
                >
                  <Ban className="mr-1.5 h-3.5 w-3.5" /> Bloquear
                </Button>
              )}
            </div>
          </div>
        ))}
        {!isLoading && filtered.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Nenhum estabelecimento encontrado.
          </div>
        )}
      </div>
    </div>
  );
}
