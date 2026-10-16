import { z } from "zod";

export const orderQuoteSchema = z
  .object({
    subtotal_cents: z.number().int().nonnegative(),
    frete_cents: z.number().int().nonnegative(),
    desconto_cents: z.number().int().nonnegative(),
    total_cents: z.number().int().nonnegative(),
  })
  .refine(
    (quote) =>
      quote.total_cents === quote.subtotal_cents + quote.frete_cents - quote.desconto_cents,
  );

export type OrderQuote = z.infer<typeof orderQuoteSchema>;
type QuoteState = {
  requestId: number;
  fingerprint: string;
  status: "idle" | "loading" | "ready" | "error";
  quote: OrderQuote | null;
  error: string | null;
};
type QuoteEvent = { requestId: number; fingerprint: string } & (
  | { type: "start" }
  | { type: "success"; quote: OrderQuote }
  | { type: "error"; error: string }
);

export const initialCheckoutQuote: QuoteState = {
  requestId: 0,
  fingerprint: "",
  status: "idle",
  quote: null,
  error: null,
};

export function checkoutQuoteReducer(state: QuoteState, event: QuoteEvent): QuoteState {
  if (event.type === "start")
    return {
      requestId: event.requestId,
      fingerprint: event.fingerprint,
      status: "loading",
      quote: null,
      error: null,
    };
  if (state.requestId !== event.requestId || state.fingerprint !== event.fingerprint) return state;
  return event.type === "success"
    ? { ...state, status: "ready", quote: event.quote, error: null }
    : { ...state, status: "error", quote: null, error: event.error };
}

export function currentCheckoutQuote(state: QuoteState, fingerprint: string): OrderQuote | null {
  return state.status === "ready" && state.fingerprint === fingerprint ? state.quote : null;
}

export function checkoutFailure(message: string) {
  const refreshQuote =
    message.startsWith("CHECKOUT_REJECTED:") || message.startsWith("CHECKOUT_QUOTE_CHANGED:");
  return {
    refreshQuote,
    message: refreshQuote
      ? message
          .replace(/^CHECKOUT_REJECTED:/, "")
          .replace(/^CHECKOUT_QUOTE_CHANGED:/, "")
          .trim()
      : "Não foi possível confirmar a resposta. Tente novamente para verificar a mesma tentativa.",
  };
}

type LedgerAmounts = {
  status: string;
  gross_cents: number;
  platform_revenue_cents: number;
  merchant_payout_cents: number;
  courier_payout_cents: number;
};
export function sumLedgerAmounts(rows: LedgerAmounts[]) {
  return rows
    .filter((row) => row.status !== "reversed")
    .reduce(
      (total, row) => ({
        gross: total.gross + row.gross_cents,
        revenue: total.revenue + row.platform_revenue_cents,
        merchant: total.merchant + row.merchant_payout_cents,
        courier: total.courier + row.courier_payout_cents,
      }),
      { gross: 0, revenue: 0, merchant: 0, courier: 0 },
    );
}

export const walletSummarySchema = z.object({
  available_cents: z.number().int().nonnegative(),
  pending_cents: z.number().int(),
  total_cents: z.number().int(),
  reserved_cents: z.number().int().nonnegative(),
});

export type WalletSummary = z.infer<typeof walletSummarySchema>;

export const emptyWallet: WalletSummary = {
  available_cents: 0,
  pending_cents: 0,
  total_cents: 0,
  reserved_cents: 0,
};

// Accept plain BRL amounts, rejecting partial parses, exponents and negative values.
export function parseMoneyCents(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized.replace(",", ".")) * 100);
  return Number.isSafeInteger(cents) && cents <= 2147483647 ? cents : null;
}
