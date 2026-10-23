import { createServerFn } from "@tanstack/react-start";

// Public discovery only: expose no credentials, readiness details or provider response.
export const getCatalogOnlineAvailability = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { paymentRpc } = await import("./asaas-payment-store.server");
    const status = await paymentRpc<{ enabled: boolean }>("asaas_online_status");
    return status.enabled === true;
  } catch {
    return false;
  }
});
