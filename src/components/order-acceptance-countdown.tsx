import { useEffect, useState } from "react";
import { acceptanceSecondsRemaining } from "@/lib/order-acceptance";
export function OrderAcceptanceCountdown({
  deadline,
  customer = false,
}: {
  deadline?: string | null;
  customer?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  const seconds = acceptanceSecondsRemaining(deadline, now);
  if (seconds === null) return null;
  return (
    <p
      className={
        "rounded-xl border p-3 text-sm " +
        (seconds
          ? "border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
          : "border-destructive/30 bg-destructive/5 text-destructive")
      }
    >
      {seconds > 0 ? (
        <>
          {customer ? "Aguardando a confirmação da loja" : "Aceite o pedido em até"}{" "}
          <strong role="timer" aria-live="off">
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </strong>
          {customer ? " para continuar o preparo." : ". Após o prazo, ele será cancelado."}
        </>
      ) : customer ? (
        "A loja não respondeu dentro do prazo. Aguarde a atualização do cancelamento."
      ) : (
        "Prazo encerrado. O sistema está encerrando este pedido."
      )}
    </p>
  );
}
