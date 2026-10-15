import { resolveAppUrl } from "./app-url";

// Vite supplies the same public origin to browser and SSR builds.
export const APP_URL = resolveAppUrl({
  appUrl:
    import.meta.env?.VITE_APP_URL ||
    (typeof process !== "undefined" ? process.env.APP_URL : undefined),
  vercelUrl: typeof process !== "undefined" ? process.env.VERCEL_URL : undefined,
});
