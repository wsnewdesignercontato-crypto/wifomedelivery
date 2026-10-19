import { createFileRoute } from "@tanstack/react-router";
import { authorizeAsaasWorker, runAsaasPaymentWorker } from "@/lib/asaas-payment-worker.server";
export const Route = createFileRoute("/api/internal/asaas-reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorizeAsaasWorker(request)) return Response.json({ ok: false }, { status: 401 });
        try {
          return Response.json({
            ok: true,
            ...(await runAsaasPaymentWorker({ limit: 10, budgetMs: 70000 })),
          });
        } catch {
          return Response.json({ ok: false }, { status: 503 });
        }
      },
    },
  },
});
