import { APP_PROFILES } from "./app-profiles.ts";
import type { AppInstallRecordInput } from "./app-install-record.ts";

export function assertAppObservationOrigin(
  request: Request,
  appType: AppInstallRecordInput["appType"],
): void {
  const profile = appType === "entrega" ? "entregador" : appType;
  const expected = new URL(APP_PROFILES[profile].origin);
  // Nitro may receive HTTP behind Vercel's HTTPS terminator. Match the actual
  // request host, never X-Forwarded-Host, and require the browser's HTTPS Origin.
  if (
    request.headers.get("origin") !== expected.origin ||
    new URL(request.url).host !== expected.host
  ) {
    throw new Error("Forbidden: invalid application origin");
  }
}
