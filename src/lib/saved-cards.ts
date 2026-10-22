/** Public metadata only. Provider tokens stay on the server. */
export type SavedCard = { id: string; brand: string; last4: string };
export type CardOptions = { savedCardId?: string; saveCard?: boolean };
export type TokenizedCard = { token: string; brand: string; last4: string };
export function validateCardOptions(value: unknown): CardOptions {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Confira a opção de cartão.");
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).some((key) => !["savedCardId", "saveCard"].includes(key)) ||
    (row.saveCard !== undefined && typeof row.saveCard !== "boolean") ||
    (row.savedCardId !== undefined &&
      (typeof row.savedCardId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          row.savedCardId,
        ))) ||
    (row.savedCardId && row.saveCard)
  )
    throw new Error("Confira a opção de cartão.");
  return {
    ...(typeof row.savedCardId === "string" ? { savedCardId: row.savedCardId } : {}),
    ...(typeof row.saveCard === "boolean" ? { saveCard: row.saveCard } : {}),
  };
}
