import { createFileRoute } from "@tanstack/react-router";
import { handleAsaasWebhook } from "@/lib/asaas-webhook.server";
import { getAsaasCredentials, recordAsaasEvent } from "@/lib/asaas-storage.server";
export const Route = createFileRoute("/api/payments/asaas/webhook")({
  server: {
    handlers: {
      POST: ({ request }) =>
        handleAsaasWebhook(request, {
          getCredentials: getAsaasCredentials,
          record: recordAsaasEvent,
        }),
    },
  },
});
