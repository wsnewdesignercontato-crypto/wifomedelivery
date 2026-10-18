export function acceptanceSecondsRemaining(
  deadline: string | null | undefined,
  now = Date.now(),
): number | null {
  if (!deadline) return null;
  const end = Date.parse(deadline);
  return Number.isFinite(end) ? Math.max(0, Math.ceil((end - now) / 1000)) : null;
}
export function pendingOrderStillOpen(
  order: { status?: string; acceptance_deadline?: string | null },
  now = Date.now(),
) {
  return (
    order.status === "placed" &&
    (acceptanceSecondsRemaining(order.acceptance_deadline, now) ?? 1) > 0
  );
}
