import { APP_PROFILES } from "./app-profiles";

export function authEmailOrigins(appUrl: string, vercelUrl?: string): string[] {
  return [
    ...new Set([
      appUrl,
      ...Object.values(APP_PROFILES).map((app) => app.origin),
      "https://wifomedelivery.vercel.app",
      "https://wifomedelivery-wsnewdesignercontato-6856.vercel.app",
      ...(vercelUrl ? [`https://${vercelUrl}`] : []),
    ]),
  ];
}
