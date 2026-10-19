import { isIP } from "node:net";
import * as transport from "./asaas-payment-api.server.ts";
import {
  validatePayer,
  validateCard,
  type CardInput,
  type PayerInput,
  type PaymentView,
  type PaymentSnapshot,
  type PixData,
} from "./asaas-payment-contract.ts";
import type { AsaasEnvironment } from "./asaas-config.ts";
export type PaymentAttempt = {
  attemptId: string;
  orderId: string;
  userId: string;
  environment: AsaasEnvironment;
  revision: string;
  externalReference: string;
  operationId: string | null;
  customerId: string | null;
  paymentId: string | null;
  billingType: "PIX" | "CREDIT_CARD";
  valueCents: number;
  state: string;
  expiresAt: string;
  mode: "create" | "reuse" | "reconcile";
};
export type PaymentStore = {
  claim: (userId: string, orderId: string, retry?: boolean) => Promise<PaymentAttempt>;
  credentials: (
    environment: AsaasEnvironment,
  ) => Promise<transport.PaymentCredentials & { revision: string }>;
  customerClaim: (
    userId: string,
    environment: AsaasEnvironment,
  ) => Promise<{
    customerId: string | null;
    operationId: string | null;
    externalReference: string;
  }>;
  customerComplete: (
    userId: string,
    environment: AsaasEnvironment,
    operation: string,
    id: string,
  ) => Promise<boolean>;
  attach: (attempt: string, operation: string, snapshot: PaymentSnapshot) => Promise<boolean>;
  apply: (attempt: string, snapshot: PaymentSnapshot, eventId?: string) => Promise<PaymentView>;
  view: (userId: string, orderId: string) => Promise<PaymentView>;
  fail: (attempt: string, operation: string, kind: "declined" | "uncertain") => Promise<boolean>;
  pixSave: (attempt: string, pix: PixData) => Promise<unknown>;
  cancelRequest: (userId: string, orderId: string) => Promise<PaymentView>;
};
export type PaymentRequestContext = { https: boolean; remoteIp: string };
export class PaymentReconciliationError extends Error {
  constructor() {
    super("Não foi possível conferir a cobrança. Aguarde a conciliação.");
  }
}
export function createPaymentService(
  store: PaymentStore,
  api: typeof transport = transport,
  options: { signal?: AbortSignal } = {},
) {
  async function credentials(a: PaymentAttempt) {
    const c = await store.credentials(a.environment);
    if (c.revision !== a.revision) throw new PaymentReconciliationError();
    return c;
  }
  function match(a: PaymentAttempt, s: PaymentSnapshot) {
    if (
      s.externalReference !== a.externalReference ||
      s.customerId !== a.customerId ||
      s.billingType !== a.billingType ||
      s.valueCents !== a.valueCents ||
      (a.paymentId && s.id !== a.paymentId)
    )
      throw new PaymentReconciliationError();
  }
  async function apply(a: PaymentAttempt, s: PaymentSnapshot, eventId?: string) {
    match(a, s);
    await store.apply(a.attemptId, s, eventId);
    const view = await store.view(a.userId, a.orderId);
    if (
      a.billingType === "PIX" &&
      view.state === "pending" &&
      !view.pix &&
      Date.parse(a.expiresAt) > Date.now()
    ) {
      try {
        await store.pixSave(
          a.attemptId,
          await api.getAsaasPix(await credentials(a), s.id, options),
        );
      } catch {
        /* A missing QR can be retried by refresh; it does not invalidate the charge. */
      }
    }
    return store.view(a.userId, a.orderId);
  }
  async function reconcilePayment(a: PaymentAttempt, eventId?: string) {
    const c = await credentials(a);
    const found = a.paymentId
      ? [await api.getAsaasPayment(c, a.paymentId, options)]
      : await api.findAsaasPayments(c, a.externalReference, options);
    if (found.length === 0) return store.view(a.userId, a.orderId);
    if (found.length !== 1) throw new PaymentReconciliationError();
    return apply(a, found[0], eventId);
  }
  async function runPaymentAttempt(
    userId: string,
    orderId: string,
    payerInput: unknown,
    cardInput: unknown,
    request: PaymentRequestContext,
    retry = false,
  ) {
    const payer = validatePayer(payerInput);
    const card = cardInput === undefined ? undefined : validateCard(cardInput);
    if (card && (!request.https || !isIP(request.remoteIp)))
      throw new Error("Use uma conexão segura para pagar com cartão.");
    let a = await store.claim(userId, orderId, retry);
    if (a.userId !== userId || a.orderId !== orderId || a.environment !== "production")
      throw new PaymentReconciliationError();
    if (a.mode === "reuse") return store.view(userId, orderId);
    if (a.mode === "reconcile") return reconcilePayment(a);
    if (!a.operationId) throw new PaymentReconciliationError();
    if (a.billingType === "CREDIT_CARD" && (!card || !request.https || !isIP(request.remoteIp))) {
      await store.fail(a.attemptId, a.operationId, "declined");
      throw new Error("Confira os dados do cartão em uma conexão segura.");
    }
    let sent = false;
    try {
      const c = await credentials(a);
      const customer = await store.customerClaim(userId, a.environment);
      let customerId = customer.customerId;
      if (!customerId) {
        if (!customer.operationId) throw new PaymentReconciliationError();
        customerId = await api.findOrCreateAsaasCustomer(
          c,
          customer.externalReference,
          payer,
          options,
        );
        if (
          !(await store.customerComplete(userId, a.environment, customer.operationId, customerId))
        )
          throw new PaymentReconciliationError();
      }
      a = { ...a, customerId };
      sent = true;
      const snapshot = await api.createAsaasPayment(
        c,
        {
          customerId,
          externalReference: a.externalReference,
          billingType: a.billingType,
          valueCents: a.valueCents,
        },
        payer,
        a.billingType === "CREDIT_CARD" ? card : undefined,
        request.remoteIp,
        options,
      );
      if (!(await store.attach(a.attemptId, a.operationId!, snapshot)))
        throw new PaymentReconciliationError();
      return await apply(a, snapshot);
    } catch (error) {
      const kind =
        !sent || (error instanceof transport.AsaasPaymentError && error.kind === "declined")
          ? "declined"
          : "uncertain";
      await store.fail(a.attemptId, a.operationId!, kind);
      return store.view(userId, orderId);
    }
  }
  async function cancelPayment(a: PaymentAttempt) {
    await store.cancelRequest(a.userId, a.orderId);
    let view = await reconcilePayment(a);
    if (view.state === "cancel_pending" && a.paymentId) {
      const c = await credentials(a);
      const snapshot = await api.getAsaasPayment(c, a.paymentId, options);
      match(a, snapshot);
      // Never turn a DELETE response into a refund. Only an unpaid pending charge is removable.
      if (snapshot.status === "PENDING") {
        await api.cancelAsaasPayment(c, snapshot.id, options);
        view = await apply(a, { ...snapshot, status: "DELETED" });
      }
    }
    return view;
  }
  return { runPaymentAttempt, reconcilePayment, cancelPayment };
}
