import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Bike, Ban, CheckCircle2, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getKycLabel, isCourierApproved, normalizeReviewStatus } from "@/lib/courier-approval";

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
  aprovacao: string | null;
  kyc_status: string | null;
  kyc_motivo: string | null;
};

type CourierRow = Courier & {
  nome: string | null;
  telefone: string | null;
};

async function fetchCouriers(): Promise<CourierRow[]> {
  const { data, error } = await supabase
    .from("courier_profiles")
    .select("user_id,veiculo,placa,status,cnh,last_seen,aprovacao,kyc_status,kyc_motivo");
  if (error) throw error;

  const list = (data ?? []) as Courier[];
  if (list.length === 0) return [];

  const ids = list.map((courier) => courier.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,nome,telefone")
    .in("id", ids);
  const profileMap = new Map(
    ((profiles ?? []) as { id: string; nome: string | null; telefone: string | null }[]).map(
      (profile) => [profile.id, profile],
    ),
  );

  return list.map((courier) => ({
    ...courier,
    nome: profileMap.get(courier.user_id)?.nome ?? null,
    telefone: profileMap.get(courier.user_id)?.telefone ?? null,
  }));
}

function getCadastroLabel(courier: CourierRow) {
  const approval = normalizeReviewStatus(courier.aprovacao);
  const kyc = normalizeReviewStatus(courier.kyc_status);

  if (courier.status === "bloqueado") return "Bloqueado";
  if (approval === "rejected" || kyc === "rejected") return "Rejeitado";
  if (isCourierApproved(courier)) return "Aprovado";

  return "Em analise";
}

function cadastroClass(courier: CourierRow) {
  const label = getCadastroLabel(courier);

  if (label === "Aprovado") return "bg-emerald-500/10 text-emerald-600";
  if (label === "Rejeitado" || label === "Bloqueado") {
    return "bg-destructive/10 text-destructive";
  }

  return "bg-amber-500/10 text-amber-600";
}

function EntregadoresPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "online" | "offline" | "ocupado" | "pending">("all");
  const { data, isLoading } = useQuery({ queryKey: ["admin-couriers"], queryFn: fetchCouriers });
  const qc = useQueryClient();

  const filtered = (data ?? []).filter((courier) => {
    if (q && !(courier.nome ?? "").toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "pending") return !isCourierApproved(courier) || courier.status === "pendente";
    if (filter !== "all" && courier.status !== filter) return false;
    return true;
  });

  async function writeAudit(action: string, userId: string) {
    const { data: authData } = await supabase.auth.getUser();
    const adminId = authData.user?.id;
    if (!adminId) return;

    await supabase.from("admin_audit_log").insert({
      admin_id: adminId,
      action,
      entity_type: "courier",
      entity_id: userId,
    });
  }

  async function approveCourier(userId: string) {
    const { error } = await supabase
      .from("courier_profiles")
      .update({
        status: "offline",
        aprovacao: "approved",
        kyc_status: "approved",
        kyc_motivo: null,
      })
      .eq("user_id", userId);

    if (error) return toast.error("Falha ao aprovar entregador");

    toast.success("Cadastro de entregador aprovado");
    await writeAudit("courier_approve", userId);
    qc.invalidateQueries({ queryKey: ["admin-couriers"] });
  }

  async function setStatus(userId: string, newStatus: "offline" | "online") {
    const courier = (data ?? []).find((row) => row.user_id === userId);
    if (newStatus === "online" && courier && !isCourierApproved(courier)) {
      return toast.error("Aprove o cadastro antes de colocar este entregador online");
    }

    const { error } = await supabase
      .from("courier_profiles")
      .update({ status: newStatus })
      .eq("user_id", userId);
    if (error) return toast.error("Falha ao atualizar");

    toast.success(newStatus === "offline" ? "Entregador desconectado" : "Entregador reativado");
    await writeAudit(`courier_set_${newStatus}`, userId);
    qc.invalidateQueries({ queryKey: ["admin-couriers"] });
  }

  const statusPill: Record<string, string> = {
    online: "bg-emerald-500/10 text-emerald-600",
    offline: "bg-muted text-muted-foreground",
    ocupado: "bg-primary/10 text-primary",
    pendente: "bg-amber-500/10 text-amber-600",
    bloqueado: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Bike className="h-6 w-6 text-primary" />
            Entregadores
          </h1>
          <p className="text-sm text-muted-foreground">{data?.length ?? 0} entregador(es).</p>
        </div>
        <div className="flex gap-2">
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
            {(["all", "pending", "online", "ocupado", "offline"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-2 text-xs font-medium ${
                  filter === key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {key === "all"
                  ? "Todos"
                  : key === "pending"
                    ? "Pendentes"
                    : key[0].toUpperCase() + key.slice(1)}
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
                <th className="px-4 py-3">Veiculo</th>
                <th className="px-4 py-3">CNH</th>
                <th className="px-4 py-3">Cadastro</th>
                <th className="px-4 py-3">Operacao</th>
                <th className="px-4 py-3 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading &&
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={6} className="px-4 py-3">
                      <div className="h-8 animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))}

              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhum entregador.
                  </td>
                </tr>
              )}

              {filtered.map((courier) => (
                <tr key={courier.user_id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="font-medium">{courier.nome || "Sem nome"}</p>
                    <p className="text-xs text-muted-foreground">{courier.telefone || "--"}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {courier.veiculo ?? "--"} {courier.placa ? `· ${courier.placa}` : ""}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{courier.cnh ?? "--"}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <Badge className={cadastroClass(courier)}>{getCadastroLabel(courier)}</Badge>
                      <div className="text-xs text-muted-foreground">
                        KYC {getKycLabel(courier.kyc_status)}
                      </div>
                      {courier.kyc_motivo && (
                        <div className="max-w-xs text-xs text-muted-foreground">
                          Motivo: {courier.kyc_motivo}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        statusPill[courier.status] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {courier.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!isCourierApproved(courier) ? (
                      <Button size="sm" onClick={() => approveCourier(courier.user_id)}>
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                        Aprovar cadastro
                      </Button>
                    ) : courier.status === "online" || courier.status === "ocupado" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-rose-600"
                        onClick={() => setStatus(courier.user_id, "offline")}
                      >
                        <Ban className="mr-1.5 h-3.5 w-3.5" />
                        Desconectar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setStatus(courier.user_id, "online")}
                      >
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                        Ativar
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
