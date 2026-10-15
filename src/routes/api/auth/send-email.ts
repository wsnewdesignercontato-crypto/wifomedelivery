import { createFileRoute } from "@tanstack/react-router";
import { handleBrevoAuthHook } from "@/lib/brevo-hook.server";
import { getBrevoCredentials, claimBrevoHook, completeBrevoHook } from "@/lib/brevo-storage.server";
import { resolveAppUrl } from "@/lib/app-url";

export const Route = createFileRoute("/api/auth/send-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const appUrl = resolveAppUrl({
          appUrl: process.env.APP_URL,
          vercelUrl: process.env.VERCEL_URL,
        });
        const allowedOrigins = [appUrl];
        if (process.env.VERCEL_URL) allowedOrigins.push(`https://${process.env.VERCEL_URL}`);
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
