import { createFileRoute } from "@tanstack/react-router";
import { WithdrawalHistory } from "@/components/withdrawal-history";
import { useMyEstab } from "@/hooks/use-my-estab";

export const Route = createFileRoute("/_authenticated/estabelecimento/saques")({
  component: SaquesEstab,
});

function SaquesEstab() {
  const { estab } = useMyEstab();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">Histórico de saques</h1>
        <p className="text-sm text-muted-foreground">
          Todas as solicitações da loja com status, datas e comprovantes.
        </p>
      </div>
      <WithdrawalHistory
        table="establishment_withdrawals"
        ownerColumn="establishment_id"
        ownerId={estab?.id}
      />
    </div>
  );
}
