import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PaymentView, PaymentState } from "@/lib/asaas-payment-contract";
const messages: Record<PaymentState, { title: string; description: string }> = {
  creating: {
    title: "Preparando pagamento",
    description: "Aguarde. Estamos preparando uma única cobrança para este pedido.",
  },
  pending: {
    title: "Aguardando pagamento",
    description: "A loja receberá o pedido assim que o pagamento for confirmado.",
  },
  processing: {
    title: "Processando cartão",
    description: "Aguarde a confirmação. Não faça outro pagamento.",
  },
  risk_analysis: {
    title: "Cartão em análise",
    description: "A Asaas está analisando o pagamento. Não é necessário tentar novamente.",
  },
  confirmed: {
    title: "Pagamento confirmado",
    description: "Seu pedido foi enviado para a loja. Não pague novamente na entrega.",
  },
  received: {
    title: "Pagamento recebido",
    description: "Pago online. Não pague novamente na entrega.",
  },
  declined: {
    title: "Pagamento recusado",
    description:
      "Nenhum pedido foi enviado à loja. Você pode tentar novamente, se o prazo ainda estiver aberto.",
  },
  uncertain: {
    title: "Conferindo pagamento",
    description:
      "Ainda não recebemos uma resposta definitiva. Não faça outro pagamento; estamos conferindo na Asaas.",
  },
  cancel_pending: {
    title: "Conferindo cancelamento",
    description:
      "O pedido foi interrompido. Estamos conferindo a cobrança; se houve pagamento, o reembolso será acompanhado pelo suporte.",
  },
  cancelled: {
    title: "Pagamento cancelado",
    description: "A cobrança foi cancelada. Este pedido não será preparado.",
  },
  expired: {
    title: "Prazo de pagamento encerrado",
    description: "Este pedido não será preparado. Confira o estado antes de fazer outro pagamento.",
  },
  refund_pending: {
    title: "Reembolso em análise",
    description:
      "Existe um pagamento que precisa de conferência pelo suporte. O reembolso ainda não foi concluído.",
  },
  partially_refunded: {
    title: "Reembolso parcial",
    description: "Parte do pagamento foi devolvida. O suporte está acompanhando a diferença.",
  },
  refunded: {
    title: "Pagamento reembolsado",
    description: "A Asaas confirmou o estorno. O prazo de crédito depende do meio de pagamento.",
  },
  disputed: {
    title: "Pagamento em contestação",
    description: "O suporte está acompanhando a contestação junto à Asaas.",
  },
};
export function OrderPaymentPanel({
  payment,
  busy,
  onRefresh,
  onRetry,
  onCancel,
}: {
  payment: PaymentView;
  busy: boolean;
  onRefresh: () => void;
  onRetry?: () => void;
  onCancel: () => void;
}) {
  const [copy, setCopy] = useState("");
  const info = messages[payment.state];
  const cancellable = [
    "creating",
    "pending",
    "processing",
    "risk_analysis",
    "uncertain",
    "declined",
  ].includes(payment.state);
  return (
    <section
      aria-label="Pagamento online"
      className="min-w-0 space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div role="status">
        <h2 className="font-bold">{info.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{info.description}</p>
      </div>
      <p className="font-semibold">
        {(payment.totalCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
      </p>
      {payment.pix && payment.state === "pending" && (
        <div className="min-w-0 space-y-2">
          <img
            src={"data:image/png;base64," + payment.pix.encodedImage}
            alt="QR Code do Pix deste pedido"
            width={220}
            height={220}
            className="mx-auto h-auto w-full max-w-[220px] rounded-lg bg-white p-2"
          />
          <label className="block text-sm">
            Código Pix copia e cola
            <textarea
              readOnly
              value={payment.pix.payload}
              onFocus={(event) => event.currentTarget.select()}
              className="mt-1 block min-h-20 w-full min-w-0 resize-y break-all rounded-lg border bg-background p-2 text-xs"
            />
          </label>
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(payment.pix!.payload);
                setCopy("Código copiado.");
              } catch {
                setCopy("Selecione o código acima e use Copiar no seu celular.");
              }
            }}
          >
            Copiar Pix
          </Button>
          <p role="status" className="text-xs">
            {copy}
          </p>
          <p className="text-xs text-muted-foreground">
            Pague dentro do prazo do pedido, até{" "}
            {payment.expiresAt
              ? new Date(payment.expiresAt).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "o encerramento"}
            . A validade bancária do QR pode ser diferente. Não pague após o encerramento do pedido.
          </p>
        </div>
      )}
      <div className="flex min-w-0 flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy}
          className="min-h-11 whitespace-normal"
          onClick={onRefresh}
        >
          Conferir pagamento
        </Button>
        {payment.canRetry && onRetry && (
          <Button disabled={busy} className="min-h-11 whitespace-normal" onClick={onRetry}>
            Tentar novo pagamento
          </Button>
        )}
        {cancellable && (
          <Button
            variant="ghost"
            disabled={busy}
            className="min-h-11 whitespace-normal"
            onClick={onCancel}
          >
            Cancelar pedido
          </Button>
        )}
      </div>
    </section>
  );
}
