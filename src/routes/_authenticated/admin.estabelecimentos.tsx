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
    .select(
      "id,nome,categoria_id,is_open,status,avaliacao,tempo_medio_min,taxa_entrega_cents,logo_url,cidade,estado",
    )
    .order("nome");
  if (error) throw error;
  return (data ?? []) as Estab[];
}

function EstabsPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "aberto" | "fechado" | "bloqueado" | "pendente">(
    "all",
  );
  const { data, isLoading } = useQuery({ queryKey: ["admin-estabs"], queryFn: fetchEstabs });
  const qc = useQueryClient();

  const filtered = (data ?? []).filter((estab) => {
    if (q && !estab.nome.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "aberto") return estab.status === "aprovado" && estab.is_open;
    if (filter === "fechado") return estab.status === "aprovado" && !estab.is_open;
    if (filter === "bloqueado") return estab.status === "bloqueado";
    if (filter === "pendente") return estab.status === "pendente" || estab.status === "rejeitado";
    return true;
  });

  async function writeAudit(action: string, estabId: string) {
    const { data: authData } = await supabase.auth.getUser();
    const adminId = authData.user?.id;
    if (!adminId) return;

    await supabase.from("admin_audit_log").insert({
      admin_id: adminId,
      action,
      entity_type: "establishment",
      entity_id: estabId,
    });
  }

  async function setStatus(id: string, status: "aprovado" | "bloqueado") {
    const patch = status === "aprovado" ? { status, is_open: false } : { status, is_open: false };

    const { error } = await supabase.from("establishments").update(patch).eq("id", id);
    if (error) return toast.error("Falha ao atualizar");

    toast.success(status === "bloqueado" ? "Estabelecimento bloqueado" : "Cadastro aprovado");
    await writeAudit(`estab_${status}`, id);
    qc.invalidateQueries({ queryKey: ["admin-estabs"] });
  }

  function statusPill(estab: Estab) {
    if (estab.status === "bloqueado") return "bg-rose-500/10 text-rose-600";
    if (estab.status === "pendente" || estab.status === "rejeitado") {
      return "bg-amber-500/10 text-amber-600";
    }
    if (estab.is_open) return "bg-emerald-500/10 text-emerald-600";
    return "bg-muted text-muted-foreground";
  }

  function statusLabel(estab: Estab) {
    if (estab.status === "bloqueado") return "Bloqueado";
    if (estab.status === "pendente") return "Pendente";
    if (estab.status === "rejeitado") return "Rejeitado";
    return estab.is_open ? "Aberto" : "Fechado";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Store className="h-6 w-6 text-primary" />
            Estabelecimentos
          </h1>
          <p className="text-sm text-muted-foreground">{data?.length ?? 0} loja(s).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Buscar..."
              className="w-64 pl-9"
            />
          </div>
          <div className="flex overflow-hidden rounded-lg border border-border bg-card">
            {(["all", "pendente", "aberto", "fechado", "bloqueado"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  filter === key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {key === "all"
                  ? "Todos"
                  : key === "pendente"
                    ? "Pendentes"
                    : key[0].toUpperCase() + key.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading &&
          Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-2xl bg-muted" />
          ))}

        {filtered.map((estab) => (
          <div
            key={estab.id}
            className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
                {estab.logo_url ? (
                  <img
                    src={estab.logo_url}
                    alt={estab.nome}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Store className="h-6 w-6 text-primary" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold text-foreground">{estab.nome}</h3>
                <p className="truncate text-xs text-muted-foreground">
                  {estab.categoria_id ?? "--"} · {estab.cidade ?? "--"}/{estab.estado ?? "--"}
                </p>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3 w-3 text-amber-500" />
                    {estab.avaliacao?.toFixed(1) ?? "--"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {estab.tempo_medio_min ?? "--"} min
                  </span>
                  <span>{brl(estab.taxa_entrega_cents ?? 0)}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusPill(estab)}`}
                >
                  {statusLabel(estab)}
                </span>
                <span className="text-[11px] text-muted-foreground">{estab.status}</span>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              {estab.status === "pendente" || estab.status === "rejeitado" ? (
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => setStatus(estab.id, "aprovado")}
                >
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  Aprovar cadastro
                </Button>
              ) : estab.status === "bloqueado" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStatus(estab.id, "aprovado")}
                >
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  Desbloquear
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-rose-600"
                  onClick={() => setStatus(estab.id, "bloqueado")}
                >
                  <Ban className="mr-1.5 h-3.5 w-3.5" />
                  Bloquear
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
