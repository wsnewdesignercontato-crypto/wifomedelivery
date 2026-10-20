import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { OrderQuote } from "@/lib/commerce";

const fmt = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function quoteErrorMessage(error: string) {
  if (error.includes("Required addon group or selection limit not satisfied"))
    return "Confira os adicionais obrigatórios e os limites de escolha dos produtos. No carrinho, remova o item incompleto e adicione novamente pela loja com os adicionais selecionados.";
  if (error.includes("Coupon unavailable"))
    return "Este cupom não está disponível para o pedido. Remova o cupom para conferir o total sem desconto.";
  if (error.includes("Minimum order not reached"))
    return "O pedido ainda não atingiu o valor mínimo da loja. Revise os itens no carrinho.";
  if (error.includes("Address outside"))
    return "O endereço está fora da área de entrega da loja. Escolha outro endereço salvo ou a retirada no local.";
  if (error.includes("Store closed or unavailable"))
    return "A loja está fechada ou indisponível. Confira a loja antes de continuar.";
  if (
    error.includes("Product") ||
    error.includes("Addon") ||
    error.includes("cart item") ||
    error.includes("Empty cart")
  )
    return "Um item do carrinho está indisponível ou precisa ser revisado. Confira os itens no carrinho.";
  return error;
}

export function CheckoutSummary({
  quote,
  pickup,
  coupon,
  establishmentId,
  canQuote,
  error,
  onRetry,
}: {
  quote: OrderQuote | null;
  pickup: boolean;
  coupon?: string;
  establishmentId?: string;
  canQuote: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <section
      aria-labelledby="checkout-summary-heading"
      className="space-y-3 rounded-2xl border border-border bg-card p-4 text-sm"
    >
      <h2 id="checkout-summary-heading" className="font-semibold">
        Resumo do pedido
      </h2>
      <dl className="space-y-1.5">
        <div className="flex justify-between text-muted-foreground">
          <dt>Subtotal</dt>
          <dd>{quote ? fmt(quote.subtotal_cents) : "—"}</dd>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <dt>{pickup ? "Retirada" : "Entrega"}</dt>
          <dd>{quote ? fmt(quote.frete_cents) : "—"}</dd>
        </div>
        <div className="flex justify-between gap-3 text-primary">
          <dt>Desconto{coupon ? ` · ${coupon}` : ""}</dt>
          <dd>
            {quote ? `${quote.desconto_cents > 0 ? "−" : ""}${fmt(quote.desconto_cents)}` : "—"}
          </dd>
        </div>
        <div className="flex justify-between border-t border-border pt-3 text-base font-bold">
          <dt>Total</dt>
          <dd>{quote ? fmt(quote.total_cents) : "—"}</dd>
        </div>
      </dl>
      {error ? (
        <div role="alert" className="space-y-2">
          <p className="text-destructive">
            Não foi possível conferir os valores. {quoteErrorMessage(error)}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="default" size="sm" onClick={onRetry}>
              Conferir novamente
            </Button>
            {coupon && error.includes("Coupon unavailable") && (
              <Link
                to="/cliente/checkout"
                search={{}}
                className="self-center text-primary underline"
              >
                Remover cupom
              </Link>
            )}
            <Link to="/cliente/carrinho" className="self-center text-primary underline">
              Revisar carrinho
            </Link>
            {establishmentId && error.includes("Required addon group") && (
              <Link
                to="/cliente/estabelecimento/$id"
                params={{ id: establishmentId }}
                className="self-center text-primary underline"
              >
                Escolher adicionais na loja
              </Link>
            )}
          </div>
        </div>
      ) : !quote ? (
        <p role="status" className="text-muted-foreground">
          {canQuote
            ? "Conferindo preços, entrega e cupom…"
            : "Selecione um endereço ou a retirada para conferir o total."}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Valores conferidos com a loja. Se o preço mudar, você precisará revisar e confirmar
          novamente.
        </p>
      )}
    </section>
  );
}
