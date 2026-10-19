import { createFileRoute } from "@tanstack/react-router";
import { handleAsaasWebhook } from "@/lib/asaas-webhook.server";
import { getAsaasWebhookCredentials, recordAsaasEvent } from "@/lib/asaas-storage.server";
export const Route = createFileRoute("/api/payments/asaas/webhook")({
  server: {
    handlers: {
      POST: ({ request }) =>
        handleAsaasWebhook(request, {
          getCredentials: getAsaasWebhookCredentials,
          record: recordAsaasEvent,
        }),
    },
  },
});
