import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getOnlinePayment,
  refreshOnlinePayment,
  retryOnlinePayment,
  cancelOnlinePayment,
} from "@/lib/asaas-payment.functions";
import type { PaymentView, PaymentMethod } from "@/lib/asaas-payment-contract";
import { OrderPaymentPanel } from "./order-payment-panel";
import { OnlinePaymentForm } from "./online-payment-form";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
export function OrderOnlinePayment({
  orderId,
  userId,
  method,
}: {
  orderId: string;
  userId: string;
  method: PaymentMethod;
}) {
  const read = useServerFn(getOnlinePayment),
    refresh = useServerFn(refreshOnlinePayment),
    retry = useServerFn(retryOnlinePayment),
    cancel = useServerFn(cancelOnlinePayment);
  const [result, setResult] = useState<{ key: string; view: PaymentView } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const key = `${userId}:${orderId}`;
  const current = useRef(key);
  current.current = key;
  const sequence = useRef(0);
  const lock = useRef(false);
  const lifecycle = useRef({ active: true });
  const view = result?.key === key ? result.view : null;
  useEffect(() => {
    const scope = lifecycle.current;
    scope.active = true;
    let alive = true;
    let polls = 0;
    setResult(null);
    setRetrying(false);
    setError("");
    const load = async (remote = false) => {
      const seq = ++sequence.current;
      try {
        const value = await (remote ? refresh : read)({ data: { orderId } });
        if (alive && seq === sequence.current && current.current === key)
          setResult({ key, view: value });
      } catch {
        if (alive && seq === sequence.current)
          setError("Não foi possível conferir o pagamento. Tente novamente.");
      }
    };
    void load(true);
    const tick = setInterval(() => {
      if (document.visibilityState === "visible" && polls++ < 80) void load();
    }, 15000);
    const resume = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      alive = false;
      scope.active = false;
      clearInterval(tick);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [key, orderId, read, refresh]);
  async function act(action: () => Promise<PaymentView>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const identity = current.current;
    const seq = ++sequence.current;
    try {
      const value = await action();
      if (lifecycle.current.active && current.current === identity && seq === sequence.current) {
        setResult({ key: identity, view: value });
        setRetrying(false);
      }
    } catch {
      if (current.current === identity)
        setError("Não foi possível concluir. Confira o pagamento antes de tentar novamente.");
    } finally {
      lock.current = false;
      if (current.current === identity) setBusy(false);
    }
  }
  if (!view)
    return (
      <div role="status" className="rounded-xl border p-4 text-sm">
        {error || "Conferindo pagamento…"}
        {error && (
          <Button onClick={() => void act(() => refresh({ data: { orderId } }))}>
            Tentar conferir novamente
          </Button>
        )}
      </div>
    );
  return (
    <div className="min-w-0 space-y-3">
      <OrderPaymentPanel
        payment={view}
        busy={busy}
        onRefresh={() => void act(() => refresh({ data: { orderId } }))}
        onRetry={() => setRetrying(true)}
        onCancel={() => {
          if (
            window.confirm(
              "Cancelar este pedido? Se já houver pagamento, ele será conferido pelo suporte.",
            )
          )
            void act(() => cancel({ data: { orderId } }));
        }}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {retrying && view.canRetry && (
        <OnlinePaymentForm
          key={`${key}:${method}`}
          method={method}
          busy={busy}
          onError={() => setError("Confira os dados de pagamento informados.")}
          onSubmit={async (payer, card, cardOptions) => {
            await act(async () => {
              const result = await retry({ data: { orderId, payer, card, cardOptions } });
              if (result.cardSaveStatus === "unavailable")
                toast.info(
                  "Não foi possível salvar o cartão para próximas compras. Confira abaixo o resultado do pagamento.",
                );
              return result;
            });
          }}
        />
      )}
    </div>
  );
}
