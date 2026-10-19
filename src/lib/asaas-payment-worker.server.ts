import { timingSafeEqual } from "node:crypto";
import type { PaymentWork } from "./asaas-payment-store.server";
import type { PaymentAttempt } from "./asaas-payment-service.server";
import {
  createPaymentService,
  PaymentReconciliationError,
} from "./asaas-payment-service.server.ts";
import { getAsaasPayment } from "./asaas-payment-api.server.ts";
import type { PaymentCredentials } from "./asaas-payment-api.server";
import type { PaymentSnapshot, PaymentView } from "./asaas-payment-contract";
export function authorizeAsaasWorker(
  request: Request,
  secret = process.env.ASAAS_RECONCILE_SECRET,
) {
  const provided = request.headers.get("x-asaas-reconcile-secret") ?? "";
  if (!secret || secret.length < 32 || provided.length > 256) return false;
  const a = Buffer.from(secret),
    b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
type Dependencies = {
  claim: (limit: number) => Promise<PaymentWork[]>;
  complete: (work: PaymentWork, outcome: "done" | "retry" | "review") => Promise<boolean>;
  context: (user: string, order: string) => Promise<PaymentAttempt | null>;
  credentials: (
    environment: "sandbox" | "production",
    revision?: string,
  ) => Promise<PaymentCredentials>;
  eventContext?: (
    environment: "sandbox" | "production",
    paymentId: string,
  ) => Promise<PaymentAttempt | null>;
  fetchPayment: typeof getAsaasPayment;
  match: (environment: string, snapshot: PaymentSnapshot) => Promise<PaymentAttempt | null>;
  service: {
    reconcilePayment: (a: PaymentAttempt, event?: string) => Promise<PaymentView>;
    cancelPayment: (a: PaymentAttempt) => Promise<PaymentView>;
  };
  now?: () => number;
};
export function createPaymentWorker(deps: Dependencies) {
  return async ({ limit = 10, budgetMs = 70000 }: { limit?: number; budgetMs?: number } = {}) => {
    const now = deps.now ?? Date.now;
    const end = now() + Math.min(70000, Math.max(0, budgetMs));
    const signal = AbortSignal.timeout(Math.min(70000, Math.max(1, budgetMs)));
    const result = { processed: 0, pending: 0, failed: 0 };
    const works = await deps.claim(Math.min(10, Math.max(1, limit)));
    for (const work of works) {
      if (end - now() < 48000) {
        await deps.complete(work, "retry");
        result.pending++;
        continue;
      }
      try {
        if (work.kind === "event") {
          if (!work.paymentId) {
            await deps.complete(work, "done");
            result.processed++;
            continue;
          }
          const known = await deps.eventContext?.(work.environment, work.paymentId);
          const snapshot = await deps.fetchPayment(
            await deps.credentials(work.environment, known?.revision),
            work.paymentId,
            { signal },
          );
          const a = known ?? (await deps.match(work.environment, snapshot));
          if (!a) {
            if (snapshot.externalReference.startsWith("pedetrem-")) {
              await deps.complete(work, "retry");
              result.pending++;
            } else {
              await deps.complete(work, "done");
              result.processed++;
            }
            continue;
          }
          await deps.service.reconcilePayment({ ...a, paymentId: snapshot.id }, work.eventId);
        } else {
          if (!work.attempt) throw new PaymentReconciliationError();
          const a = work.attempt;
          const view = await deps.service.reconcilePayment(a);
          if (
            (work.cancelRequested || Date.parse(a.expiresAt) <= now()) &&
            ![
              "confirmed",
              "received",
              "refunded",
              "partially_refunded",
              "disputed",
              "refund_pending",
              "cancelled",
              "expired",
            ].includes(view.state)
          ) {
            const cancelled = await deps.service.cancelPayment(a);
            if (
              !a.paymentId &&
              cancelled.state === "cancel_pending" &&
              Date.parse(a.expiresAt) <= now()
            ) {
              await deps.complete(work, "review");
              result.pending++;
              continue;
            }
          }
        }
        // apply() commits the event and clears its lease atomically; completion is also safe for no-op work.
        await deps.complete(work, "done");
        result.processed++;
      } catch (error) {
        await deps.complete(work, error instanceof PaymentReconciliationError ? "review" : "retry");
        result.failed++;
      }
    }
    return result;
  };
}
export async function runAsaasPaymentWorker(options: { limit?: number; budgetMs?: number } = {}) {
  const {
    paymentStore,
    paymentContext,
    paymentMatch,
    paymentWorkClaim,
    paymentWorkComplete,
    paymentEventContext,
  } = await import("./asaas-payment-store.server");
  const signal = AbortSignal.timeout(Math.min(70000, options.budgetMs ?? 70000));
  return createPaymentWorker({
    claim: paymentWorkClaim,
    complete: paymentWorkComplete,
    context: paymentContext,
    credentials: paymentStore.credentials,
    fetchPayment: getAsaasPayment,
    match: paymentMatch,
    eventContext: paymentEventContext,
    service: createPaymentService(paymentStore, undefined, { signal }),
  })(options);
}
