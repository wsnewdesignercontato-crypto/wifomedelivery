import { createFileRoute } from "@tanstack/react-router";
import { WithdrawalHistory } from "@/components/withdrawal-history";
import { useMyCourier } from "@/hooks/use-courier";

export const Route = createFileRoute("/_authenticated/entregador/saques")({
  component: SaquesEntregador,
});

function SaquesEntregador() {
  const { courier } = useMyCourier();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">Meus saques</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe o status de cada solicitação e baixe os comprovantes de pagamento.
        </p>
      </div>
      <WithdrawalHistory
        table="courier_withdrawals"
        ownerColumn="courier_id"
        ownerId={courier?.user_id}
      />
    </div>
  );
}
