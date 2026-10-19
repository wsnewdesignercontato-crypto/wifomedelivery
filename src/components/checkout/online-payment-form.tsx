import { useRef } from "react";
import { Button } from "@/components/ui/button";
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
}: {
  method: PaymentMethod;
  busy: boolean;
  disabled?: boolean;
  submitLabel?: string;
  onSubmit: (payer: PayerInput, card?: CardInput) => Promise<void>;
  onError?: () => void;
}) {
  const submitting = useRef(false);
  return (
    <form
      autoComplete="off"
      className="min-w-0 space-y-3 rounded-2xl border border-border bg-card p-4"
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
            method === "cartao"
              ? validateCard({
                  holderName: value("holderName"),
                  number: value("number"),
                  expiryMonth: value("expiryMonth"),
                  expiryYear: value("expiryYear"),
                  ccv: value("ccv"),
                })
              : undefined;
          form.reset();
          await onSubmit(payer, card);
        } catch {
          onError?.();
        } finally {
          form.reset();
          submitting.current = false;
        }
      }}
    >
      <h2 className="font-semibold">
        {method === "pix" ? "Pix online" : "Cartão online · à vista"}
      </h2>
      <p className="text-xs text-muted-foreground">
        O pagamento é processado pela Asaas. A loja recebe seu pedido após a confirmação.
      </p>
      <fieldset disabled={busy || disabled} className="min-w-0 space-y-3">
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
                  { name: "holderName", label: "Nome no cartão", max: 120 },
                  { name: "number", label: "Número do cartão", max: 23 },
                  { name: "expiryMonth", label: "Mês de validade (MM)", max: 2 },
                  { name: "expiryYear", label: "Ano de validade (AAAA)", max: 4 },
                  { name: "ccv", label: "Código de segurança (CVV)", max: 4, type: "password" },
                ]
              : []),
          ].map((field) => (
            <label key={field.name} className="block min-w-0 text-sm">
              <span className="mb-1 block">{field.label}</span>
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
                className="h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-primary"
              />
            </label>
          ))}
        </div>
        <Button
          type="submit"
          className="min-h-11 w-full whitespace-normal"
          disabled={busy || disabled}
        >
          {busy ? "Conferindo pagamento…" : submitLabel}
        </Button>
      </fieldset>
      <p className="text-xs text-muted-foreground">
        Os dados do cartão são apagados deste formulário após a tentativa.
      </p>
    </form>
  );
}
