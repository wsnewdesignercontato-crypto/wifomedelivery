import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getAsaasCredentials } from "./asaas-storage.server";
import type { Database, Json } from "@/integrations/supabase/types";
import type { PaymentStore, PaymentAttempt } from "./asaas-payment-service.server";
import type { PaymentView, PaymentSnapshot } from "./asaas-payment-contract";
type Rpc = keyof Database["public"]["Functions"];
export async function paymentRpc<T>(name: Rpc, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabaseAdmin.rpc(name, args as never);
  if (error) throw new Error("Não foi possível atualizar o pagamento. Tente conferir novamente.");
  return data as T;
}
export const paymentStore: PaymentStore = {
  claim: (u, o, retry = false) =>
    paymentRpc("asaas_payment_claim", { _user_id: u, _order_id: o, _retry: retry }),
  credentials: async (environment, revision) => {
    if (revision) {
      const row = await paymentRpc<{
        environment: typeof environment;
        revision: string;
        apiKey: string;
      }>("asaas_payment_credentials", { _environment: environment, _revision: revision });
      if (row.environment !== environment || row.revision !== revision || !row.apiKey)
        throw new Error("Credencial histórica indisponível.");
      return row;
    }
    const c = await getAsaasCredentials(environment);
    if (!c.apiKey) throw new Error("Pagamento indisponível.");
    return { ...c, apiKey: c.apiKey };
  },
  customerClaim: (u, e) => paymentRpc("asaas_customer_claim", { _user_id: u, _environment: e }),
  customerComplete: (u, e, op, id) =>
    paymentRpc("asaas_customer_complete", {
      _user_id: u,
      _environment: e,
      _operation_id: op,
      _customer_id: id,
    }),
  attach: (id, op, s) =>
    paymentRpc("asaas_payment_attach", { _attempt_id: id, _operation_id: op, _snapshot: s }),
  apply: (id, s, event) =>
    paymentRpc("asaas_payment_apply", { _attempt_id: id, _snapshot: s, _source_event_id: event }),
  view: (u, o) => paymentRpc("asaas_payment_view", { _user_id: u, _order_id: o }),
  fail: (id, op, kind) =>
    paymentRpc("asaas_payment_fail", { _attempt_id: id, _operation_id: op, _kind: kind }),
  pixSave: (id, pix) => paymentRpc("asaas_payment_pix_save", { _attempt_id: id, _pix: pix }),
  cancelRequest: (u, o) =>
    paymentRpc("asaas_payment_cancel_request", { _user_id: u, _order_id: o }),
};
export const paymentContext = (u: string, o: string) =>
  paymentRpc<PaymentAttempt | null>("asaas_payment_context", { _user_id: u, _order_id: o });
export const paymentEventContext = (environment: string, paymentId: string) =>
  paymentRpc<PaymentAttempt | null>("asaas_payment_event_context", {
    _environment: environment,
    _payment_id: paymentId,
  });
export const paymentMatch = (environment: string, snapshot: PaymentSnapshot) =>
  paymentRpc<PaymentAttempt | null>("asaas_payment_match", {
    _environment: environment,
    _snapshot: snapshot,
  });
export type PaymentWork = {
  workId: string;
  operationId: string;
  kind: "event" | "attempt";
  environment: "sandbox" | "production";
  paymentId: string | null;
  eventId?: string;
  attempt?: PaymentAttempt;
  cancelRequested?: boolean;
};
export const paymentWorkClaim = (limit = 10) =>
  paymentRpc<PaymentWork[]>("asaas_payment_work_claim", { _limit: limit });
export const paymentWorkComplete = (work: PaymentWork, outcome: "done" | "retry" | "review") =>
  paymentRpc<boolean>("asaas_payment_work_complete", {
    _work_id: work.workId,
    _operation_id: work.operationId,
    _outcome: outcome,
  });
export type AdminPayment = {
  id: string;
  order_id: string;
  environment: string;
  payment_id: string | null;
  external_reference: string;
  value_cents: number;
  net_value_cents: number | null;
  refunded_value_cents: number;
  state: string;
  provider_status: string | null;
  created_at: string;
  expires_at: string;
  paid_at: string | null;
  order_status: string;
  payment_received_at: string | null;
  issues: { kind: string; createdAt: string }[];
};
export type AdminPayments = { payments: AdminPayment[]; unresolvedCount: number };
export type { PaymentView, Json };
