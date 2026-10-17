import type { PerfilApp } from "./app-profiles";
import type { AppInstallRecordInput } from "./app-install-record";
import type { PwaInstallationEvidence } from "./pwa-installation";

/** Observations do not require an account; association is a separate, optional write. */
export async function syncPwaInstall(
  profile: PerfilApp,
  installationId: string,
  evidence: PwaInstallationEvidence,
  authenticated: boolean,
  writes: {
    observe: (input: AppInstallRecordInput) => Promise<unknown>;
    record: (input: AppInstallRecordInput) => Promise<unknown>;
  },
): Promise<void> {
  const input: AppInstallRecordInput = {
    appType: profile === "entregador" ? "entrega" : profile,
    installationId,
    installed: evidence.installed,
    evidence: evidence.evidence,
  };
  const results = await Promise.allSettled([
    writes.observe(input),
    ...(authenticated ? [writes.record(input)] : []),
  ]);
  const failed = results.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
}
