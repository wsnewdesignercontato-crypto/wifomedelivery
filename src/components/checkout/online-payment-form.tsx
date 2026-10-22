import { useRef, useState } from "react";
import { CreditCard, LockKeyhole, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SavedCard, CardOptions } from "@/lib/saved-cards";
import {
  validatePayer,
  validateCard,
  type PaymentMethod,
  type PayerInput,
  type CardInput,
} from "@/lib/asaas-payment-contract";
export function OnlinePaymentForm({
  method,
  busy,
  onSubmit,
  disabled = false,
  submitLabel = "Pagar agora",
  onError,
  savedCards = [],
  cardsLoading = false,
  cardsError = null,
  onRetryCards,
  onRemoveCard,
}: {
  method: PaymentMethod;
  busy: boolean;
  disabled?: boolean;
  submitLabel?: string;
  onSubmit: (payer: PayerInput, card?: CardInput, cardOptions?: CardOptions) => Promise<void>;
  onError?: () => void;
  savedCards?: SavedCard[];
  cardsLoading?: boolean;
  cardsError?: string | null;
  onRetryCards?: () => void;
  onRemoveCard?: (id: string) => Promise<void>;
}) {
  const submitting = useRef(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const savedCard =
    method === "cartao" ? savedCards.find((card) => card.id === selectedCardId) : undefined;
  const blocked = busy || disabled;
  return (
    <form
      autoComplete="off"
      className="min-w-0 space-y-6 rounded-3xl border border-border/70 bg-card p-5 shadow-sm sm:p-7"
      onSubmit={async (event) => {
        event.preventDefault();
        if (submitting.current || busy || disabled) return;
        submitting.current = true;
        const form = event.currentTarget;
        try {
          const fields = new FormData(form);
          const value = (name: string) => String(fields.get(name) ?? "");
          const payer = validatePayer({
            name: value("name"),
            cpfCnpj: value("cpfCnpj"),
            email: value("email"),
            phone: value("phone"),
            ...(method === "cartao"
              ? { postalCode: value("postalCode"), addressNumber: value("addressNumber") }
              : {}),
          });
          const card =
            method === "cartao" && !savedCard
              ? validateCard({
                  holderName: value("holderName"),
                  number: value("number"),
                  expiryMonth: value("expiryMonth"),
                  expiryYear: value("expiryYear"),
                  ccv: value("ccv"),
                })
              : undefined;
          const cardOptions: CardOptions | undefined =
            method === "cartao"
              ? savedCard
                ? { savedCardId: savedCard.id }
                : { saveCard: fields.get("saveCard") === "on" }
              : undefined;
          form.reset();
          await onSubmit(payer, card, cardOptions);
        } catch {
          onError?.();
        } finally {
          form.reset();
          submitting.current = false;
        }
      }}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/5 text-primary">
          <LockKeyhole className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {method === "pix" ? "Pix online" : "Cartão online · à vista"}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Processado pela Asaas. A loja recebe seu pedido após a confirmação.
          </p>
        </div>
      </div>
      <fieldset disabled={blocked} className="min-w-0 space-y-5">
        {method === "cartao" && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Seus cartões</h3>
            {cardsLoading && (
              <p role="status" className="text-sm text-muted-foreground">
                Carregando cartões salvos…
              </p>
            )}
            {cardsError && (
              <div role="alert" className="rounded-xl bg-muted/50 p-3 text-sm">
                <p>{cardsError}</p>
                {onRetryCards && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={blocked || cardsLoading}
                    onClick={onRetryCards}
                  >
                    Tentar novamente
                  </Button>
                )}
              </div>
            )}
            {savedCards.map((card) => (
              <div
                key={card.id}
                className={`flex min-w-0 items-center gap-2 rounded-2xl border p-3 transition ${savedCard?.id === card.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="radio"
                    name="payment-card"
                    value={card.id}
                    checked={savedCard?.id === card.id}
                    disabled={blocked || cardsLoading}
                    onChange={() => setSelectedCardId(card.id)}
                    className="h-4 w-4 accent-primary"
                  />
                  <CreditCard
                    className="h-5 w-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 text-sm">
                    <span className="block font-medium">
                      {card.brand} ···· {card.last4}
                    </span>
                    <span className="text-xs text-muted-foreground">Cartão salvo</span>
                  </span>
                </label>
                {onRemoveCard && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={blocked || cardsLoading}
                    aria-label={`Remover cartão ${card.brand} final ${card.last4}`}
                    onClick={async () => {
                      try {
                        await onRemoveCard(card.id);
                      } catch {
                        onError?.();
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </Button>
                )}
              </div>
            ))}
            {savedCards.length > 0 && (
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 text-sm font-medium ${!savedCard ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <input
                  type="radio"
                  name="payment-card"
                  value="new"
                  checked={!savedCard}
                  onChange={() => setSelectedCardId(null)}
                  className="h-4 w-4 accent-primary"
                />
                Usar outro cartão
              </label>
            )}
          </div>
        )}
        <h3 className="text-sm font-semibold">Dados do pagador</h3>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {[
            { name: "name", label: "Nome completo", max: 120 },
            { name: "cpfCnpj", label: "CPF ou CNPJ", max: 24 },
            { name: "email", label: "E-mail do pagador", max: 254, type: "email" },
            { name: "phone", label: "Telefone com DDD", max: 20, type: "tel" },
            ...(method === "cartao"
              ? [
                  { name: "postalCode", label: "CEP de cobrança", max: 9 },
                  { name: "addressNumber", label: "Número do endereço de cobrança", max: 20 },
                ]
              : []),
            ...(method === "cartao" && !savedCard
              ? [
                  { name: "holderName", label: "Nome no cartão", max: 120 },
                  { name: "number", label: "Número do cartão", max: 23 },
                  { name: "expiryMonth", label: "Mês de validade (MM)", max: 2 },
                  { name: "expiryYear", label: "Ano de validade (AAAA)", max: 4 },
                  { name: "ccv", label: "Código de segurança (CVV)", max: 4, type: "password" },
                ]
              : []),
          ].map((field) => (
            <label key={field.name} className="block min-w-0 text-sm">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {field.label}
              </span>
              <input
                name={field.name}
                type={field.type ?? "text"}
                required
                maxLength={field.max}
                autoComplete="off"
                inputMode={
                  ["number", "expiryMonth", "expiryYear", "ccv", "postalCode", "phone"].includes(
                    field.name,
                  )
                    ? "numeric"
                    : undefined
                }
                className="h-12 w-full min-w-0 rounded-xl border border-input bg-background px-3.5 text-base transition focus-visible:outline-2 focus-visible:outline-primary"
              />
            </label>
          ))}
        </div>
        {method === "cartao" && !savedCard && (
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-muted/40 p-4 text-sm">
            <input
              type="checkbox"
              name="saveCard"
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
            />
            <span>
              <span className="block font-medium">Salvar cartão para a próxima compra</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                Opcional. Guardamos apenas uma referência segura e os dados mascarados do cartão.
              </span>
            </span>
          </label>
        )}
        <Button
          type="submit"
          className="min-h-12 w-full whitespace-normal rounded-xl text-base font-semibold shadow-sm"
          disabled={busy || disabled}
        >
          {busy ? "Conferindo pagamento…" : submitLabel}
        </Button>
      </fieldset>
      <p className="flex items-center gap-2 text-xs leading-relaxed text-muted-foreground">
        <LockKeyhole className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {method === "cartao"
          ? "Número e CVV não ficam salvos neste navegador. Os campos são apagados após a tentativa."
          : "Você receberá o QR Code e o código Pix para concluir o pagamento."}
      </p>
    </form>
  );
}
