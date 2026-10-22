import { isIP } from "node:net";
import {
  paymentIdentifier,
  paymentText,
  normalizeDocument,
  validatePayer,
  validateCard,
  validatePaymentSnapshot,
} from "./asaas-payment-contract.ts";
import type { CardInput, PayerInput, PaymentSnapshot, PixData } from "./asaas-payment-contract.ts";
import type { AsaasEnvironment } from "./asaas-config";
import type { TokenizedCard } from "./saved-cards.ts";

export type PaymentCredentials = { environment: AsaasEnvironment; apiKey: string | null };
export type PaymentAttemptInput = {
  customerId: string;
  externalReference: string;
  billingType: "PIX" | "CREDIT_CARD";
  valueCents: number;
};
type Options = { fetch?: typeof fetch; signal?: AbortSignal };
export class AsaasPaymentError extends Error {
  readonly kind: "declined" | "uncertain";
  constructor(kind: "declined" | "uncertain") {
    super(
      kind === "declined"
        ? "Pagamento não autorizado. Confira os dados ou use outro meio de pagamento."
        : "Não foi possível confirmar o resultado do pagamento. Aguarde a conferência antes de tentar novamente.",
    );
    this.kind = kind;
  }
}
const origins = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
} as const;
async function request(
  credentials: PaymentCredentials,
  path: string,
  method: "GET" | "POST" | "DELETE",
  body: unknown,
  options: Options,
  card = false,
): Promise<Record<string, unknown>> {
  if (
    !credentials.apiKey ||
    (credentials.environment !== "sandbox" && credentials.environment !== "production")
  )
    throw new AsaasPaymentError("uncertain");
  try {
    const deadline = AbortSignal.timeout(card ? 65000 : 8000);
    const response = await (options.fetch ?? fetch)(origins[credentials.environment] + path, {
      method,
      headers: {
        access_token: credentials.apiKey,
        "User-Agent": "PedeTrem/1.0",
        accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: options.signal ? AbortSignal.any([deadline, options.signal]) : deadline,
      redirect: "error",
    });
    if (!response.ok) {
      let declined = false;
      if (card && response.status === 400) {
        const data: unknown = await response.json().catch(() => null);
        declined =
          !!data &&
          typeof data === "object" &&
          Array.isArray((data as Record<string, unknown>).errors) &&
          (data as { errors: unknown[] }).errors.some(
            (e) =>
              e &&
              typeof e === "object" &&
              (e as Record<string, unknown>).code === "invalid_creditCard",
          );
      }
      throw new AsaasPaymentError(declined ? "declined" : "uncertain");
    }
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new AsaasPaymentError("uncertain");
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AsaasPaymentError) throw error;
    throw new AsaasPaymentError("uncertain");
  }
}
export async function findOrCreateAsaasCustomer(
  credentials: PaymentCredentials,
  userReference: string,
  input: PayerInput,
  options: Options = {},
): Promise<string> {
  const payer = validatePayer(input),
    reference = paymentText(userReference, 200);
  const listed = await request(
    credentials,
    "/customers?limit=100&externalReference=" + encodeURIComponent(reference),
    "GET",
    undefined,
    options,
  );
  if (!Array.isArray(listed.data) || listed.hasMore === true || listed.data.length > 1)
    throw new AsaasPaymentError("uncertain");
  if (listed.data.length) {
    const row = listed.data[0];
    if (
      !row ||
      typeof row !== "object" ||
      row.externalReference !== reference ||
      normalizeDocument(row.cpfCnpj) !== payer.cpfCnpj
    )
      throw new AsaasPaymentError("uncertain");
    return paymentIdentifier(row.id);
  }
  const created = await request(
    credentials,
    "/customers",
    "POST",
    {
      name: payer.name,
      cpfCnpj: payer.cpfCnpj,
      email: payer.email,
      mobilePhone: payer.phone,
      postalCode: payer.postalCode,
      addressNumber: payer.addressNumber,
      externalReference: reference,
      notificationDisabled: true,
    },
    options,
  );
  return paymentIdentifier(created.id);
}
export async function createAsaasPayment(
  credentials: PaymentCredentials,
  attempt: PaymentAttemptInput,
  input: PayerInput,
  cardInput: CardInput | undefined,
  remoteIp: string,
  options: Options = {},
  savedToken?: string,
): Promise<PaymentSnapshot & { cardToken?: TokenizedCard }> {
  const payer = validatePayer(input),
    customer = paymentIdentifier(attempt.customerId),
    externalReference = paymentText(attempt.externalReference, 200);
  if (
    !Number.isInteger(attempt.valueCents) ||
    attempt.valueCents <= 0 ||
    attempt.valueCents > 2147480000 ||
    (attempt.billingType !== "PIX" && attempt.billingType !== "CREDIT_CARD")
  )
    throw new AsaasPaymentError("uncertain");
  if (savedToken && (cardInput || attempt.billingType !== "CREDIT_CARD"))
    throw new Error("Confira a opção de cartão.");
  const token = savedToken ? paymentIdentifier(savedToken) : undefined;
  const card =
    attempt.billingType === "CREDIT_CARD" && !token ? validateCard(cardInput) : undefined;
  if (token && !isIP(remoteIp)) throw new Error("Confira a conexão do pagamento.");
  if (card && (!isIP(remoteIp) || !payer.postalCode || !payer.addressNumber))
    throw new Error("Confira os dados e o endereço do titular do cartão.");
  const result = await request(
    credentials,
    "/payments",
    "POST",
    {
      customer,
      billingType: attempt.billingType,
      value: attempt.valueCents / 100,
      dueDate: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
      externalReference,
      description: "Pedido PedeTrem",
      ...(token ? { creditCardToken: token, remoteIp, authorizeOnly: false } : {}),
      ...(card
        ? {
            creditCard: card,
            creditCardHolderInfo: {
              name: payer.name,
              email: payer.email,
              cpfCnpj: payer.cpfCnpj,
              postalCode: payer.postalCode,
              addressNumber: payer.addressNumber,
              phone: payer.phone,
              mobilePhone: payer.phone,
            },
            remoteIp,
            authorizeOnly: false,
          }
        : {}),
    },
    options,
    !!card || !!token,
  );
  const snapshot = validatePaymentSnapshot(result);
  if (
    snapshot.customerId !== customer ||
    snapshot.externalReference !== externalReference ||
    snapshot.billingType !== attempt.billingType ||
    snapshot.valueCents !== attempt.valueCents
  )
    throw new AsaasPaymentError("uncertain");
  const metadata =
    result.creditCard && typeof result.creditCard === "object"
      ? (result.creditCard as Record<string, unknown>)
      : result;
  let cardToken: TokenizedCard | undefined;
  if (
    attempt.billingType === "CREDIT_CARD" &&
    typeof metadata.creditCardToken === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(metadata.creditCardToken) &&
    typeof metadata.creditCardBrand === "string" &&
    /^[A-Za-z0-9 _-]{1,40}$/.test(metadata.creditCardBrand) &&
    typeof metadata.creditCardNumber === "string" &&
    /^\d{4}$/.test(metadata.creditCardNumber)
  ) {
    cardToken = {
      token: metadata.creditCardToken,
      brand: metadata.creditCardBrand,
      last4: metadata.creditCardNumber,
    };
  }
  return { ...snapshot, ...(cardToken ? { cardToken } : {}) };
}
export async function findAsaasPayments(
  credentials: PaymentCredentials,
  externalReference: string,
  options: Options = {},
): Promise<PaymentSnapshot[]> {
  const reference = paymentText(externalReference, 200);
  const result = await request(
    credentials,
    "/payments?limit=100&externalReference=" + encodeURIComponent(reference),
    "GET",
    undefined,
    options,
  );
  if (!Array.isArray(result.data) || result.hasMore === true || result.data.length > 1)
    throw new AsaasPaymentError("uncertain");
  const payments = result.data.map(validatePaymentSnapshot);
  if (payments.some((p) => p.externalReference !== reference))
    throw new AsaasPaymentError("uncertain");
  return payments;
}
export async function getAsaasPayment(
  credentials: PaymentCredentials,
  paymentId: string,
  options: Options = {},
): Promise<PaymentSnapshot> {
  const id = paymentIdentifier(paymentId),
    result = validatePaymentSnapshot(
      await request(credentials, "/payments/" + id, "GET", undefined, options),
    );
  if (result.id !== id) throw new AsaasPaymentError("uncertain");
  return result;
}
export async function getAsaasPix(
  credentials: PaymentCredentials,
  paymentId: string,
  options: Options = {},
): Promise<PixData> {
  const row = await request(
    credentials,
    "/payments/" + paymentIdentifier(paymentId) + "/pixQrCode",
    "GET",
    undefined,
    options,
  );
  if (
    typeof row.encodedImage !== "string" ||
    row.encodedImage.length > 200000 ||
    !/^[A-Za-z0-9+/=]+$/.test(row.encodedImage) ||
    typeof row.payload !== "string" ||
    !row.payload.startsWith("000201") ||
    row.payload.length > 4096 ||
    typeof row.expirationDate !== "string" ||
    !Number.isFinite(Date.parse(row.expirationDate))
  )
    throw new AsaasPaymentError("uncertain");
  return {
    encodedImage: row.encodedImage,
    payload: row.payload,
    expirationDate: row.expirationDate,
  };
}
export async function cancelAsaasPayment(
  credentials: PaymentCredentials,
  paymentId: string,
  options: Options = {},
): Promise<void> {
  const result = await request(
    credentials,
    "/payments/" + paymentIdentifier(paymentId),
    "DELETE",
    undefined,
    options,
  );
  if (result.deleted !== true) throw new AsaasPaymentError("uncertain");
}
