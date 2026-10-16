import { z } from "zod";

const profile = z.enum(["cliente", "estabelecimento", "entregador"]).catch("cliente");
export const authSearchSchema = z.object({
  app: profile.optional(),
  perfil: profile.optional(),
  redirect: z.string().optional(),
  // TanStack parses the unquoted ?confirmado=1 value as a number.
  confirmado: z.preprocess((value) => (value === 1 ? "1" : value), z.string().optional()),
});
export type AuthSearch = z.infer<typeof authSearchSchema>;
