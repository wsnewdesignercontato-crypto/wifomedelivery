export function OrderPaymentBadge({
  channel,
  state,
  isTest = false,
}: {
  channel?: string | null;
  state?: string | null;
  isTest?: boolean;
}) {
  const online = channel === "asaas";
  const paid = online && ["confirmed", "received"].includes(state ?? "");
  const label = isTest
    ? "Teste · não cobrar"
    : channel === "free"
      ? "Sem valor a cobrar"
      : paid
        ? "Pago online · não cobrar"
        : online
          ? "Pagamento online · em conferência"
          : "Cobrar na entrega";
  return (
    <span
      className={`inline-flex max-w-full rounded-lg border px-2 py-1 text-xs font-semibold ${paid || channel === "free" ? "border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-border bg-muted text-foreground"}`}
    >
      {label}
    </span>
  );
}
