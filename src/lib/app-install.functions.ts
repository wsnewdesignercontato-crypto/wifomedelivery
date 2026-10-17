import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  appInstallRecordSchema,
  appInstallRecordResultSchema,
  appInstallMetricsSchema,
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

export const observeAppInstall = createServerFn({ method: "POST" })
  .validator((data: AppInstallRecordInput) => appInstallRecordSchema.parse(data))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { assertAppObservationOrigin } = await import("@/lib/app-install-origin");
    assertAppObservationOrigin(getRequest(), data.appType);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("observe_pwa_install", {
      p_app_type: data.appType,
      p_installation_id: data.installationId,
      p_evidence: data.evidence,
      p_installed: data.installed,
    });
    if (error) throw new Error("Não foi possível registrar a observação do aplicativo.");
    // Do not reveal whether this installation UUID already exists.
    return { ok: true as const };
  });

export const getAppInstallMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || isAdmin !== true) throw new Error("Forbidden: admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("admin_pwa_install_metrics");
    if (error) throw new Error("Não foi possível carregar as instalações dos aplicativos.");
    return appInstallMetricsSchema.parse(data);
  });
