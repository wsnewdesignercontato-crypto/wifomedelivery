import { createFileRoute } from "@tanstack/react-router";
import {
  authorizePushDispatchRequest,
  flushPendingPushNotifications,
  isPushDispatchConfigured,
} from "@/lib/push-dispatch.server";

export const Route = createFileRoute("/api/internal/push-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isPushDispatchConfigured()) {
          console.error(
            "[push-dispatch] Missing PUSH_DISPATCH_SECRET or SUPABASE_SERVICE_ROLE_KEY.",
          );
          return Response.json({ ok: false }, { status: 503 });
        }

        if (!authorizePushDispatchRequest(request)) {
          return Response.json({ ok: false }, { status: 401 });
        }

        try {
          const result = await flushPendingPushNotifications();
          return Response.json({ ok: true, ...result });
        } catch (error) {
          console.error("push-dispatch error", error);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
