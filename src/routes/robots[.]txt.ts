import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { APP_URL } from "@/lib/app-config";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(`User-agent: *\nAllow: /\n\nSitemap: ${APP_URL}/sitemap.xml\n`, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        }),
    },
  },
});
