import { validEmail } from "./brevo-config.ts";

export type PaymentMethod = "pix" | "cartao";
export type PaymentChannel = "delivery" | "asaas" | "free";
export type PaymentState =
  | "creating"
  | "pending"
  | "processing"
  | "risk_analysis"
  | "confirmed"
  | "received"
  | "declined"
  | "uncertain"
  | "cancel_pending"
  | "cancelled"
  | "expired"
  | "refund_pending"
  | "partially_refunded"
  | "refunded"
  | "disputed";
export type PayerInput = {
  name: string;
  cpfCnpj: string;
  email: string;
  phone: string;
  postalCode?: string;
  addressNumber?: string;
};
export type CardInput = {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
};
export type PixData = { encodedImage: string; payload: string; expirationDate: string };
export type PaymentView = {
  orderId: string;
  channel: PaymentChannel;
  state: PaymentState;
  totalCents: number;
  expiresAt: string | null;
  paidAt: string | null;
  pix: PixData | null;
  canRetry: boolean;
  message: string;
};
export type PaymentSnapshot = {
  id: string;
  customerId: string;
  externalReference: string;
  billingType: "PIX" | "CREDIT_CARD";
  valueCents: number;
  netValueCents: number | null;
  refundedValueCents: number;
  status: string;
};

const invalid = () => new Error("Confira os dados de pagamento informados.");
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
export function paymentText(value: unknown, max: number): string {
  if (typeof value !== "string") throw invalid();
  const text = value.trim();
  if (
    !text ||
    text.length > max ||
    Array.from(text).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
    /[<>]/.test(text)
  )
    throw invalid();
  return text;
}
export function paymentIdentifier(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw invalid();
  return value;
}
function formatted(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) throw invalid();
  return value;
}
export function normalizeDocument(value: unknown): string {
  const doc = paymentText(value, 24).toUpperCase();
  if (!/^[A-Z0-9.\-/ ]+$/.test(doc)) throw invalid();
  return doc.replace(/[.\-/ ]/g, "");
}
function validDocument(doc: string): boolean {
  if (/^(.)\1+$/.test(doc)) return false;
  if (/^\d{11}$/.test(doc)) {
    const digit = (n: number) => {
      const sum = Array.from(doc.slice(0, n)).reduce((s, d, i) => s + Number(d) * (n + 1 - i), 0);
      return ((sum * 10) % 11) % 10;
    };
    return digit(9) === Number(doc[9]) && digit(10) === Number(doc[10]);
  }
  if (/^[A-Z0-9]{12}\d{2}$/.test(doc)) {
    const digit = (n: number) => {
      let weight = n - 7;
      const sum = Array.from(doc.slice(0, n)).reduce((s, d) => {
        const next = s + (d.charCodeAt(0) - 48) * weight;
        weight = weight === 2 ? 9 : weight - 1;
        return next;
      }, 0);
      const rem = sum % 11;
      return rem < 2 ? 0 : 11 - rem;
    };
    return digit(12) === Number(doc[12]) && digit(13) === Number(doc[13]);
  }
  return false;
}
export function validatePayer(value: unknown): PayerInput {
  const row = object(value),
    cpfCnpj = normalizeDocument(row.cpfCnpj),
    email = paymentText(row.email, 254).toLowerCase();
  if (!validDocument(cpfCnpj) || !validEmail(email)) throw invalid();
  const phone = formatted(row.phone, /^[0-9+() -]{10,22}$/).replace(/\D/g, "");
  if (!/^\d{10,13}$/.test(phone) || /^(.)\1+$/.test(phone)) throw invalid();
  const result: PayerInput = { name: paymentText(row.name, 120), cpfCnpj, email, phone };
  if (row.postalCode !== undefined && row.postalCode !== "")
    result.postalCode = formatted(row.postalCode, /^\d{5}-?\d{3}$/).replace("-", "");
  if (row.addressNumber !== undefined && row.addressNumber !== "")
    result.addressNumber = paymentText(row.addressNumber, 20);
  return result;
}
export function validateCard(value: unknown, now = new Date()): CardInput {
  const row = object(value),
    number = formatted(row.number, /^[0-9 ]{13,25}$/).replace(/ /g, "");
  if (!/^\d{13,19}$/.test(number) || /^(.)\1+$/.test(number)) throw invalid();
  let sum = 0;
  for (let i = number.length - 1, two = false; i >= 0; i--, two = !two) {
    let d = Number(number[i]);
    if (two) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  if (sum % 10) throw invalid();
  const month = formatted(row.expiryMonth, /^\d{1,2}$/),
    year = formatted(row.expiryYear, /^\d{4}$/);
  if (
    Number(month) < 1 ||
    Number(month) > 12 ||
    Number(year) < now.getUTCFullYear() ||
    Number(year) > now.getUTCFullYear() + 25 ||
    (Number(year) === now.getUTCFullYear() && Number(month) < now.getUTCMonth() + 1)
  )
    throw invalid();
  return {
    holderName: paymentText(row.holderName, 120),
    number,
    expiryMonth: month.padStart(2, "0"),
    expiryYear: year,
    ccv: formatted(row.ccv, /^\d{3,4}$/),
  };
}
export function paymentCents(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw invalid();
  const cents = Math.round(value * 100);
  if (
    !Number.isSafeInteger(cents) ||
    cents > 2147480000 ||
    Math.abs(value * 100 - cents) > 0.000001
  )
    throw invalid();
  return cents;
}
export function validatePaymentSnapshot(value: unknown): PaymentSnapshot {
  const row = object(value),
    valueCents = paymentCents(row.value);
  if (row.billingType !== "PIX" && row.billingType !== "CREDIT_CARD") throw invalid();
  if (typeof row.status !== "string" || !/^[A-Z][A-Z0-9_]{1,63}$/.test(row.status)) throw invalid();
  let refundedValueCents = row.status === "REFUNDED" ? valueCents : 0;
  if (Array.isArray(row.refunds) && row.status !== "REFUNDED")
    refundedValueCents = row.refunds
      .filter((r) => r && typeof r === "object" && r.status === "DONE")
      .reduce((n, r) => n + paymentCents(r.value), 0);
  if (refundedValueCents > valueCents) throw invalid();
  return {
    id: paymentIdentifier(row.id),
    customerId: paymentIdentifier(row.customer),
    externalReference: paymentText(row.externalReference, 200),
    billingType: row.billingType,
    valueCents,
    netValueCents:
      row.netValue === undefined || row.netValue === null ? null : paymentCents(row.netValue),
    refundedValueCents,
    status: row.deleted === true ? "DELETED" : row.status,
  };
}
