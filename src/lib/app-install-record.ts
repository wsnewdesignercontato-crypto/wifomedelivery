import { z } from "zod";

export const appInstallRecordSchema = z
  .object({
    appType: z.enum(["cliente", "estabelecimento", "entrega"]),
    installationId: z.string().uuid(),
    evidence: z.enum(["appinstalled", "standalone", "browser-query"]),
    installed: z.boolean(),
  })
  .strict()
  .refine((value) => value.installed || value.evidence === "browser-query", {
    message: "Only a browser query can report an absent installation",
    path: ["installed"],
  });

export type AppInstallRecordInput = z.infer<typeof appInstallRecordSchema>;

export const appInstallRecordResultSchema = z.object({
  user_id: z.string().uuid(),
  app_type: z.enum(["cliente", "estabelecimento", "entrega"]),
  installation_id: z.string().uuid(),
  installed: z.boolean(),
  evidence: z.enum(["appinstalled", "standalone", "browser-query"]),
  installed_at: z.string().nullable(),
  last_opened_at: z.string().nullable(),
});
