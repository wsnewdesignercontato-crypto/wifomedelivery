import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { getPublicSupabaseConfig } from "./src/lib/supabase-config";
import { resolveAppUrl } from "./src/lib/app-url";

const serverEnvNames = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GOOGLE_MAPS_API_KEY",
  "AI_GATEWAY_API_KEY",
  "AI_GATEWAY_MODEL",
  "VERCEL_OIDC_TOKEN",
  "APP_URL",
  "PUSH_DISPATCH_SECRET",
  "VAPID_PRIVATE_JWK",
  "VAPID_PUBLIC_KEY",
  "VAPID_SUBJECT",
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const publicConfig = getPublicSupabaseConfig({
    url: env.VITE_SUPABASE_URL,
    key: env.VITE_SUPABASE_PUBLISHABLE_KEY,
  });
  const appUrl = resolveAppUrl({
    appUrl: env.VITE_APP_URL || env.APP_URL,
    vercelUrl: env.VERCEL_URL,
  });
  // Local server handlers read process.env; private values never enter Vite's define map.
  for (const name of serverEnvNames) {
    if (process.env[name] === undefined && env[name]) process.env[name] = env[name];
  }
  return {
    plugins: [
      tsconfigPaths(),
      tailwindcss(),
      tanstackStart({ server: { entry: "server" } }),
      nitro({
        preset: process.env.NITRO_PRESET || (process.env.VERCEL ? "vercel" : "node-server"),
        compatibilityDate: "2026-10-12",
      }),
      viteReact(),
    ],
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(publicConfig.url),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(publicConfig.key),
      "import.meta.env.VITE_APP_URL": JSON.stringify(appUrl),
    },
    resolve: { dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/router-core"] },
    css: { postcss: { plugins: [] } },
    server: { host: "127.0.0.1", port: 3000 },
  };
});
