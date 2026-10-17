import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  appInstallRecordSchema,
  appInstallRecordResultSchema,
  type AppInstallRecordInput,
} from "@/lib/app-install-record";

export const recordAppInstall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: AppInstallRecordInput) => appInstallRecordSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("record_app_install", {
      p_app_type: data.appType,
      p_installation_id: data.installationId,
      p_evidence: data.evidence,
      p_installed: data.installed,
    });
    if (error) throw new Error(error.message);
    return appInstallRecordResultSchema.parse(result);
  });
