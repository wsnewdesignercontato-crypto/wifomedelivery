import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Trash2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { brl } from "@/lib/format";

const person = z.object({ id: z.string().uuid(), nome: z.string().nullable() });
const stateSchema = z.object({
  enabled: z.boolean(),
  admin_id: z.string().uuid(),
  count: z.number(),
  customers: z.array(person),
  stores: z.array(
    person.extend({
      cidade: z.string().nullable(),
      estado: z.string().nullable(),
      is_open: z.boolean(),
    }),
  ),
  couriers: z.array(person.extend({ status: z.string(), cidade: z.string().nullable() })),
  sales: z.array(
    z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "approved", "declined", "refunded"]),
      order_id: z.string().uuid().nullable(),
      order_status: z.string().nullable(),
      created_at: z.string(),
      customer: z.string().nullable(),
      store: z.string(),
      courier: z.string().nullable(),
      subtotal_cents: z.number(),
      freight_cents: z.number(),
      commission_cents: z.number(),
      total_cents: z.number(),
    }),
  ),
});

async function command(action: string, payload: Record<string, Json> = {}) {
  const { data, error } = await supabase.rpc("admin_payment_test", {
    p_action: action,
    p_payload: payload,
  });
  if (error) throw new Error(error.message);
  return stateSchema.parse(data);
}
const key = ["admin-payment-simulator"];
const statuses = {
  pending: "Aguardando simulação",
  approved: "Pagamento simulado aprovado",
  declined: "Pagamento simulado recusado",
  refunded: "Estorno simulado",
};
const stages: Record<string, string> = {
  placed: "Aguardando a loja",
  accepted: "Aceito",
  preparing: "Em preparo",
  ready: "Pronto",
  waiting_courier: "Aguardando entregador",
  courier_assigned: "Entregador designado",
  picked_up: "Coletado",
  on_the_way: "Em entrega",
  arriving: "Chegando",
  delivered: "Entregue",
  cancelled: "Cancelado",
  refunded: "Estornado",
};
const selectClass = "h-10 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-sm";

export function PaymentTestSettings() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: key,
    queryFn: () => command("state"),
    refetchInterval: 5000,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [customer, setCustomer] = useState("");
  const [store, setStore] = useState("");
  const [courier, setCourier] = useState("");
  const [fulfillment, setFulfillment] = useState("delivery");
  const [payment, setPayment] = useState("pix");
  const [value, setValue] = useState("10,00");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  const selectedStore = data?.stores.find((s) => s.id === store);

  async function run(action: string, payload: Record<string, Json>, message: string) {
    if (busy) return false;
    setBusy(action);
    try {
      const result = await command(action, payload);
      qc.setQueryData(key, result);
      toast.success(message);
      return true;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível concluir o teste. Tente novamente.",
      );
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function createSale(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{1,5}([.,]\d{1,2})?$/.test(value.trim()))
      return toast.error("Informe um valor de R$ 1,00 a R$ 10.000,00.");
    const cents = Math.round(Number(value.trim().replace(",", ".")) * 100);
    if (cents < 100 || cents > 1000000)
      return toast.error("Informe um valor de R$ 1,00 a R$ 10.000,00.");
    const payload: Record<string, Json> = {
      customer_id: customer || data?.admin_id || "",
      store_id: store,
      courier_id: fulfillment === "delivery" ? courier : null,
      fulfillment,
      payment_method: payment,
      subtotal_cents: cents,
      address:
        fulfillment === "delivery"
          ? {
              rua: street.trim(),
              numero: number.trim(),
              cidade: selectedStore?.cidade || "",
              estado: selectedStore?.estado || "",
            }
          : null,
    };
    const signature = JSON.stringify(payload);
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, id: crypto.randomUUID() };
    if (
      await run(
        "create",
        { ...payload, request_key: attempt.current.id },
        "Venda de teste criada. Agora simule a aprovação ou a recusa.",
      )
    )
      attempt.current = null;
  }

  if (isLoading) return <div className="h-32 max-w-3xl animate-pulse rounded-2xl bg-muted" />;
  if (error || !data)
    return (
      <section className="max-w-3xl rounded-2xl border p-5">
        <p>Não foi possível carregar o simulador de pagamentos.</p>
        <Button className="mt-3" variant="outline" onClick={() => void refetch()}>
          Tentar novamente
        </Button>
      </section>
    );

  return (
    <section className="max-w-3xl space-y-5 rounded-2xl border border-amber-500/30 bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <FlaskConical className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <h2 className="font-bold">Pagamentos · modo de teste</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Simule a venda e acompanhe o pedido até a entrega.
            </p>
          </div>
        </div>
        <Switch
          aria-label="Modo de teste de pagamentos"
          checked={data.enabled}
          disabled={!!busy}
          onCheckedChange={(enabled) =>
            void run(
              "toggle",
              { enabled },
              enabled
                ? "Modo de teste ativado."
                : "Modo de teste desligado. As vendas normais continuam sem alterações.",
            )
          }
        />
      </div>
      <p className="rounded-xl bg-amber-500/10 p-3 text-sm">
        <strong>{data.enabled ? "Teste ativado" : "Teste desligado"} · sem dinheiro real.</strong> O
        simulador não usa sua chave de produção nem movimenta saldo, estoque ou saques. Somente as
        vendas geradas aqui são simuladas; o checkout dos clientes continua normal. Para validar a
        integração com o Asaas, use também o ambiente de testes do próprio gateway.
      </p>
      {data.enabled && (
        <form onSubmit={(event) => void createSale(event)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="test-customer">Conta do cliente</Label>
              <select
                id="test-customer"
                className={selectClass}
                value={customer || data.admin_id}
                onChange={(e) => setCustomer(e.target.value)}
              >
                {data.customers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome || p.id.slice(0, 8)}
                    {p.id === data.admin_id ? " (minha conta)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="test-store">Estabelecimento do teste</Label>
              <select
                id="test-store"
                className={selectClass}
                value={store}
                required
                onChange={(e) => setStore(e.target.value)}
              >
                <option value="">Escolha a loja</option>
                {data.stores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                    {p.is_open ? "" : " (fechada)"}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="test-fulfillment">Tipo do pedido</Label>
              <select
                id="test-fulfillment"
                className={selectClass}
                value={fulfillment}
                onChange={(e) => setFulfillment(e.target.value)}
              >
                <option value="delivery">Entrega</option>
                <option value="pickup">Retirada na loja</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="test-payment">Pagamento simulado</Label>
              <select
                id="test-payment"
                className={selectClass}
                value={payment}
                onChange={(e) => setPayment(e.target.value)}
              >
                <option value="pix">Pix</option>
                <option value="cartao">Cartão</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="test-amount">Valor dos produtos (R$)</Label>
              <Input
                id="test-amount"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                A taxa de entrega da loja é acrescentada à simulação.
              </p>
            </div>
            {fulfillment === "delivery" && (
              <div className="space-y-1.5">
                <Label htmlFor="test-courier">Entregador do teste</Label>
                <select
                  id="test-courier"
                  className={selectClass}
                  value={courier}
                  required
                  onChange={(e) => setCourier(e.target.value)}
                >
                  <option value="">Escolha o entregador</option>
                  {data.couriers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome || p.id.slice(0, 8)} ·{" "}
                      {p.status === "online"
                        ? "online"
                        : p.status === "ocupado"
                          ? "ocupado"
                          : "offline"}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {fulfillment === "delivery" && (
            <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
              <div className="space-y-1.5">
                <Label htmlFor="test-street">Rua da entrega de teste</Label>
                <Input
                  id="test-street"
                  value={street}
                  required
                  maxLength={200}
                  onChange={(e) => setStreet(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Cidade: {selectedStore?.cidade || "selecione uma loja com cidade cadastrada"}. Não
                  é necessário fazer uma entrega de verdade.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="test-number">Número</Label>
                <Input
                  id="test-number"
                  value={number}
                  maxLength={20}
                  onChange={(e) => setNumber(e.target.value)}
                />
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Use suas contas de teste. A loja recebe o pedido após aprovar o pagamento simulado. O
            entregador escolhido precisa estar online e atuar na cidade da loja para receber o aviso
            quando ela chamar a entrega.
          </p>
          <Button
            type="submit"
            disabled={
              !data.enabled ||
              !!busy ||
              !store ||
              (fulfillment === "delivery" && (!courier || !selectedStore?.cidade))
            }
            loading={busy === "create"}
          >
            Gerar venda de teste
          </Button>
        </form>
      )}
      <div className="space-y-3 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Vendas simuladas ({data.count})</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!data.count || !!busy}
            onClick={() => setCleanupOpen(true)}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Limpar testes
          </Button>
        </div>
        {!data.sales.length && (
          <p className="text-sm text-muted-foreground">
            Nenhum teste criado. Suas vendas reais não aparecem aqui.
          </p>
        )}
        <div className="max-h-[32rem] space-y-3 overflow-y-auto">
          {data.sales.map((sale) => (
            <article key={sale.id} className="space-y-3 rounded-xl border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {sale.store}{" "}
                    <span className="text-xs font-normal text-amber-700 dark:text-amber-400">
                      TESTE
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {sale.customer} · {new Date(sale.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <strong className="text-sm">{brl(sale.total_cents)}</strong>
              </div>
              <div className="text-sm">
                <p>{statuses[sale.status]}</p>
                {sale.order_id && (
                  <p className="text-muted-foreground">
                    Pedido #{sale.order_id.slice(0, 8)} ·{" "}
                    {stages[sale.order_status || ""] || sale.order_status}
                    {sale.courier ? ` · ${sale.courier}` : ""}
                  </p>
                )}
              </div>
              {sale.status === "approved" && (
                <p className="rounded-lg bg-muted p-2 text-xs">
                  Distribuição simulada · Loja: {brl(sale.subtotal_cents - sale.commission_cents)} ·
                  Entregador: {brl(sale.freight_cents)} · Plataforma: {brl(sale.commission_cents)}.
                  Estes valores não entram nas carteiras reais.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {sale.status === "pending" && (
                  <>
                    <Button
                      size="sm"
                      disabled={!data.enabled || !!busy}
                      onClick={() =>
                        void run(
                          "approve",
                          { sale_id: sale.id },
                          "Pagamento simulado aprovado. Pedido enviado à loja.",
                        )
                      }
                    >
                      Simular aprovação
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!data.enabled || !!busy}
                      onClick={() =>
                        void run(
                          "decline",
                          { sale_id: sale.id },
                          "Pagamento simulado recusado. Nenhum pedido enviado.",
                        )
                      }
                    >
                      Simular recusa
                    </Button>
                  </>
                )}
                {sale.status === "approved" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!busy}
                    onClick={() =>
                      void run(
                        "refund",
                        { sale_id: sale.id },
                        "Estorno simulado. Nenhum dinheiro foi movimentado.",
                      )
                    }
                  >
                    Simular estorno
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
        {data.count > 50 && (
          <p className="text-xs text-muted-foreground">
            Exibindo os últimos 50 testes. A limpeza inclui todos os testes.
          </p>
        )}
      </div>
      <Dialog open={cleanupOpen} onOpenChange={setCleanupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Limpar vendas de teste?</DialogTitle>
            <DialogDescription>
              Remove somente as {data.count} vendas simuladas e seus pedidos, corridas, mensagens e
              avisos vinculados. Vendas reais, cadastros, produtos e saldos são preservados. O
              registro administrativo da limpeza permanece.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={!!busy} onClick={() => setCleanupOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              loading={busy === "cleanup"}
              disabled={!!busy}
              onClick={async () => {
                if (
                  await run(
                    "cleanup",
                    { confirmation: "LIMPAR TESTES" },
                    "Testes removidos. As vendas reais foram preservadas.",
                  )
                )
                  setCleanupOpen(false);
              }}
            >
              Limpar somente testes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
