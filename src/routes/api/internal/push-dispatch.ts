import { createFileRoute } from "@tanstack/react-router";
import {
  authorizePushDispatchRequest,
  flushPendingPushNotifications,
  isPushDispatchConfigured,
} from "@/lib/push-dispatch.server";

export const Route = createFileRoute("/api/internal/push-dispatch")({
  server: {
    handlers: {
      HEAD: async ({ request }) => {
        if (!authorizePushDispatchRequest(request)) return new Response(null, { status: 401 });
        try {
          const { validateWebPushConfiguration } = await import("@/lib/web-push.server");
          await validateWebPushConfiguration();
          const { VAPID_PUBLIC_KEY } = await import("@/lib/push-config");
          if (process.env.VAPID_PUBLIC_KEY !== VAPID_PUBLIC_KEY)
            throw new Error("Frontend signing key mismatch");
          return new Response(null, { status: 204 });
        } catch {
          console.error("[push-dispatch] Invalid Web Push signing configuration");
          return new Response(null, { status: 503 });
        }
      },
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
