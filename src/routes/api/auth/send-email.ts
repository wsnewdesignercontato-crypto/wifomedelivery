import { createFileRoute } from "@tanstack/react-router";
import { handleBrevoAuthHook } from "@/lib/brevo-hook.server";
import { getBrevoCredentials, claimBrevoHook, completeBrevoHook } from "@/lib/brevo-storage.server";
import { resolveAppUrl } from "@/lib/app-url";
import { authEmailOrigins } from "@/lib/auth-origins";

export const Route = createFileRoute("/api/auth/send-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const appUrl = resolveAppUrl({
          appUrl: process.env.APP_URL,
          vercelUrl: process.env.VERCEL_URL,
        });
        // Keep the project's previously published production aliases working too.
        const allowedOrigins = authEmailOrigins(appUrl, process.env.VERCEL_URL);
        return handleBrevoAuthHook(request, {
          secret:
            process.env.AUTH_EMAIL_HOOK_ENABLED === "true"
              ? (process.env.AUTH_EMAIL_HOOK_SECRET ?? "")
              : "",
          supabaseUrl: process.env.SUPABASE_URL ?? "",
          allowedOrigins,
          getCredentials: getBrevoCredentials,
          claim: claimBrevoHook,
          complete: completeBrevoHook,
        });
      },
    },
  },
});
