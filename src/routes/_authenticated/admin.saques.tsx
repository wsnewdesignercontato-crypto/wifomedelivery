import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtBRL } from "@/lib/format";
import { Wallet, Check, X, Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/saques")({
  component: SaquesAdmin,
});

type WithdrawalTable = "courier_withdrawals" | "establishment_withdrawals";
type WithdrawalBankInfo = Record<string, unknown> | null;
type CourierWithdrawalUpdate = Database["public"]["Tables"]["courier_withdrawals"]["Update"];
type EstablishmentWithdrawalUpdate =
  Database["public"]["Tables"]["establishment_withdrawals"]["Update"];

type CourierW = {
  id: string;
  courier_id: string;
  valor_cents: number;
  status: string;
  pix_key: string | null;
  banco_info: WithdrawalBankInfo;
  created_at: string;
  motivo_recusa: string | null;
};
type EstabW = {
  id: string;
  establishment_id: string;
  valor_cents: number;
  status: string;
  pix_key: string | null;
  titular_nome: string | null;
  titular_documento: string | null;
  banco_info: WithdrawalBankInfo;
  created_at: string;
  motivo_recusa: string | null;
};

function SaquesAdmin() {
  const [tab, setTab] = useState("entregador");
  const [couriers, setCouriers] = useState<CourierW[]>([]);
  const [estabs, setEstabs] = useState<EstabW[]>([]);
  const [loading, setLoading] = useState(true);
  const [motivoOpen, setMotivoOpen] = useState<{ id: string; tabela: WithdrawalTable } | null>(
    null,
  );
  const [motivo, setMotivo] = useState("");

  async function load() {
    setLoading(true);
    const [c, e] = await Promise.all([
      supabase
        .from("courier_withdrawals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("establishment_withdrawals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    setCouriers((c.data ?? []) as CourierW[]);
    setEstabs((e.data ?? []) as EstabW[]);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function atualizar(
    tabela: WithdrawalTable,
    id: string,
    patch: CourierWithdrawalUpdate | EstablishmentWithdrawalUpdate,
  ) {
    const processedAt = new Date().toISOString();
    const { error } =
      tabela === "courier_withdrawals"
        ? await supabase
            .from("courier_withdrawals")
            .update({ ...(patch as CourierWithdrawalUpdate), processado_em: processedAt })
            .eq("id", id)
        : await supabase
            .from("establishment_withdrawals")
            .update({ ...(patch as EstablishmentWithdrawalUpdate), processado_em: processedAt })
            .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Saque atualizado");
    load();
  }

  async function recusarConfirm() {
    if (!motivoOpen || !motivo) return;
    await atualizar(motivoOpen.tabela, motivoOpen.id, {
      status: "recusado",
      motivo_recusa: motivo,
    });
    setMotivoOpen(null);
    setMotivo("");
  }

  function Row({ w, tabela }: { w: CourierW | EstabW; tabela: WithdrawalTable }) {
    const pending = w.status === "solicitado" || w.status === "em_analise";
    return (
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-black">{fmtBRL(w.valor_cents)}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(w.created_at).toLocaleString("pt-BR")}
            </p>
          </div>
          <Badge
            variant={
              w.status === "pago"
                ? "default"
                : w.status === "recusado"
                  ? "destructive"
                  : "secondary"
            }
          >
            {w.status}
          </Badge>
        </div>
        <div className="grid gap-1 text-xs">
          <p>
            <b>PIX:</b> {w.pix_key ?? "—"}
          </p>
          {"titular_nome" in w && (
            <p>
              <b>Titular:</b> {w.titular_nome ?? "—"} — Doc: {w.titular_documento ?? "—"}
            </p>
          )}
          {w.banco_info && <p className="text-muted-foreground">{JSON.stringify(w.banco_info)}</p>}
          {w.motivo_recusa && (
            <p className="text-red-500">
              <b>Recusado:</b> {w.motivo_recusa}
            </p>
          )}
        </div>
        {pending && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" onClick={() => atualizar(tabela, w.id, { status: "aprovado" })}>
              <Check className="mr-1 h-3 w-3" /> Aprovar
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => atualizar(tabela, w.id, { status: "pago" })}
            >
              Marcar como pago
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setMotivoOpen({ id: w.id, tabela });
                setMotivo("");
              }}
            >
              <X className="mr-1 h-3 w-3" /> Recusar
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Wallet className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-black">Saques</h1>
          <p className="text-xs text-muted-foreground">Aprove ou recuse pedidos de saque via PIX</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="entregador">
            Entregadores ({couriers.filter((c) => c.status === "solicitado").length})
          </TabsTrigger>
          <TabsTrigger value="estabelecimento">
            Estabelecimentos ({estabs.filter((c) => c.status === "solicitado").length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="entregador" className="space-y-3 pt-3">
          {loading && <Loader2 className="h-5 w-5 animate-spin" />}
          {!loading && couriers.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum saque.</p>
          )}
          {couriers.map((w) => (
            <Row key={w.id} w={w} tabela="courier_withdrawals" />
          ))}
        </TabsContent>
        <TabsContent value="estabelecimento" className="space-y-3 pt-3">
          {loading && <Loader2 className="h-5 w-5 animate-spin" />}
          {!loading && estabs.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum saque.</p>
          )}
          {estabs.map((w) => (
            <Row key={w.id} w={w} tabela="establishment_withdrawals" />
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={!!motivoOpen} onOpenChange={(o) => !o && setMotivoOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Motivo da recusa</DialogTitle>
          </DialogHeader>
          <Label>Explique o motivo</Label>
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex: dados divergentes"
          />
          <Button variant="destructive" onClick={recusarConfirm} disabled={!motivo}>
            Recusar saque
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
