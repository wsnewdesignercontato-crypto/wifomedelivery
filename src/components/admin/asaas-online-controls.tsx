import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getAsaasOnlineStatus,
  setAsaasOnlineEnabled,
  diagnoseAsaasSandbox,
} from "@/lib/admin-asaas.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
export function AsaasOnlineControls() {
  const load = useServerFn(getAsaasOnlineStatus),
    enable = useServerFn(setAsaasOnlineEnabled),
    diagnose = useServerFn(diagnoseAsaasSandbox);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [diagnostic, setDiagnostic] = useState<Awaited<ReturnType<typeof diagnose>> | null>(null);
  const { data, error, refetch } = useQuery({
    queryKey: ["admin-asaas-online-status"],
    queryFn: () => load(),
    retry: false,
    refetchInterval: 15000,
  });
  return (
    <div className="mt-4 min-w-0 space-y-3 rounded-xl border p-4">
      <h3 className="font-semibold">Pagamento online no checkout</h3>
      <p className="text-sm">
        Produção: <strong>{data?.enabled ? "Ativada" : "Desativada"}</strong>. Selecionar Produção
        acima não ativa o checkout.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível consultar a ativação.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Antes de ativar, homologue no Sandbox e teste a chave de produção, depois registre o webhook
        atualizado. Repasses continuam sujeitos à conferência manual.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || !data || (!data.enabled && !data.canEnable)}
          onClick={async () => {
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            try {
              await enable({ data: { enabled: !data!.enabled } });
              await refetch();
              toast.success("Ativação atualizada.");
            } catch {
              toast.error("Confira a conexão e registre o webhook atual antes de ativar.");
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          {data?.enabled ? "Desativar novas compras online" : "Ativar pagamentos em produção"}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            try {
              setDiagnostic(await diagnose());
            } catch {
              toast.error("Configure e teste a chave Sandbox antes do diagnóstico.");
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          Gerar Pix fictício no Sandbox
        </Button>
      </div>
      {diagnostic && (
        <div role="status" className="min-w-0 space-y-2 rounded-xl bg-muted p-3 text-sm">
          <p>{diagnostic.message}</p>
          <p className="break-all">
            {diagnostic.paymentId} · {diagnostic.state}
          </p>
          <p>Consulte este ID no painel Sandbox da Asaas. Não use dinheiro real.</p>
          <Button variant="ghost" onClick={() => setDiagnostic(null)}>
            Fechar diagnóstico
          </Button>
        </div>
      )}
    </div>
  );
}
