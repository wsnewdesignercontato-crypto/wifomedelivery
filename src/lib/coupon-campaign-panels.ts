import { z } from "zod";
import { parseMoneyCents } from "./commerce.ts";

const cents = z.number().int().min(0).max(2147483647);
const timestamp = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const campaignSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string().min(1).max(50),
    type: z.enum(["percent", "fixed", "free_delivery"]),
    percent: z.number().min(0).max(100),
    value_cents: cents,
    min_order_cents: cents,
    max_discount_cents: cents.nullable(),
    usage_limit: cents.nullable(),
    used_count: cents,
    ativo: z.boolean(),
    starts_at: timestamp.nullable(),
    expires_at: timestamp.nullable(),
    descricao: z.string().nullable(),
    campaign_revision: z.string().uuid(),
    participating: z.boolean(),
    requires_reacceptance: z.boolean(),
    available: z.boolean(),
  })
  .transform((campaign) => ({
    ...campaign,
    available:
      campaign.available &&
      campaign.max_discount_cents !== 0 &&
      (campaign.usage_limit === null || campaign.used_count < campaign.usage_limit) &&
      (campaign.type !== "percent" || campaign.percent > 0) &&
      (campaign.type !== "fixed" || campaign.value_cents > 0),
  }));

export type MerchantCampaign = z.infer<typeof campaignSchema>;

export function parseMerchantCampaigns(value: unknown): MerchantCampaign[] {
  const result = z.array(campaignSchema).safeParse(value);
  if (!result.success)
    throw new Error("Não foi possível validar as campanhas. Atualize e tente novamente.");
  return result.data;
}

export function parseParticipationResult(value: unknown, revision: string, participating: boolean) {
  const result = z
    .object({
      participating: z.boolean(),
      campaign_revision: z.string().uuid(),
      accepted_at: timestamp.nullable(),
    })
    .safeParse(value);
  if (
    !result.success ||
    (participating && result.data.campaign_revision !== revision) ||
    result.data.participating !== participating ||
    (participating && !result.data.accepted_at)
  ) {
    throw new Error(
      "A campanha foi atualizada ou a adesão não foi confirmada. Confira as condições novamente.",
    );
  }
  return result.data;
}

export type PublishedCampaignForm = {
  code: string;
  percent: string;
  minimum: string;
  maximum: string;
  usageLimit: string;
  description: string;
  expiresAt: string;
};

export const emptyPublishedCampaign: PublishedCampaignForm = {
  code: "",
  percent: "10",
  minimum: "",
  maximum: "",
  usageLimit: "",
  description: "",
  expiresAt: "",
};

export function buildPublishedCampaign(form: PublishedCampaignForm, now = new Date()) {
  const code = form.code.trim().toUpperCase();
  if (!code || code.length > 50 || !/^[A-Z0-9_-]+$/.test(code)) {
    throw new Error("Use um código de até 50 letras, números, hífens ou sublinhados.");
  }
  const percent = Number(form.percent);
  if (
    !/^\d+$/.test(form.percent.trim()) ||
    !Number.isInteger(percent) ||
    percent < 1 ||
    percent > 100
  ) {
    throw new Error("Informe um percentual inteiro de 1 a 100.");
  }
  const minimum = form.minimum.trim() ? parseMoneyCents(form.minimum) : 0;
  const maximum = form.maximum.trim() ? parseMoneyCents(form.maximum) : null;
  if (minimum === null || (form.maximum.trim() && (maximum === null || maximum <= 0))) {
    throw new Error("Informe valores válidos para o pedido mínimo e o desconto máximo.");
  }
  const usageLimit = form.usageLimit.trim() ? Number(form.usageLimit) : null;
  if (
    usageLimit !== null &&
    (!/^\d+$/.test(form.usageLimit.trim()) ||
      !Number.isSafeInteger(usageLimit) ||
      usageLimit < 1 ||
      usageLimit > 2147483647)
  ) {
    throw new Error("Informe um limite de usos inteiro maior que zero.");
  }
  const expiresAt = form.expiresAt ? new Date(form.expiresAt) : null;
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now)) {
    throw new Error("A validade deve ser uma data futura.");
  }
  return {
    establishment_id: null,
    ativo: true,
    code,
    type: "percent" as const,
    percent,
    value_cents: 0,
    min_order_cents: minimum,
    max_discount_cents: maximum,
    usage_limit: usageLimit,
    descricao: form.description.trim() || null,
    expires_at: expiresAt?.toISOString() ?? null,
  };
}

// A completion belongs to the mounted account/store and may never unlock a later request.
export function createCampaignRequestGuard() {
  let epoch = 0;
  let pending: symbol | null = null;
  let active = true;
  return {
    reset() {
      epoch += 1;
      pending = null;
      active = true;
    },
    cancel() {
      epoch += 1;
      pending = null;
      active = false;
    },
    begin() {
      if (!active || pending) return null;
      const requestEpoch = epoch;
      const request = Symbol("campaign request");
      pending = request;
      return {
        isCurrent: () => requestEpoch === epoch && pending === request,
        finish: () => {
          if (requestEpoch === epoch && pending === request) pending = null;
        },
      };
    },
  };
}

export async function readAllCampaignRows<T>(
  readPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const result: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await readPage(from, from + 999);
    if (error) throw error;
    if (!data) throw new Error("Não foi possível carregar todos os registros da campanha.");
    result.push(...data);
    if (data.length < 1000) return result;
  }
}

export function countCurrentCampaignParticipants(
  rows: { coupon_id: string; campaign_revision: string; participating: boolean }[],
  couponId: string,
  revision: string,
) {
  return rows.filter(
    (row) => row.coupon_id === couponId && row.campaign_revision === revision && row.participating,
  ).length;
}
