import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Trash2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
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
  testers: z.array(
    z.object({
      customer_id: z.string().uuid(),
      customer: z.string().nullable(),
      store: z.string(),
      expires_at: z.string(),
    }),
  ),
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
  const [cleanupOpen, setCleanupOpen] = useState(false);

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
        <strong>{data.enabled ? "Teste ativado" : "Teste desligado"} · sem dinheiro real.</strong>{" "}
        Libere uma conta abaixo e faça a compra no aplicativo do cliente, escolhendo produtos e
        complementos de verdade. O pagamento é aprovado no simulador e o pedido percorre loja,
        entregador e acompanhamento. Identificado como TESTE, não usa a chave Asaas nem altera
        estoque, cupons, saldos ou saques. Contas não liberadas continuam no checkout normal.
      </p>
      {data.enabled && (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              "enroll",
              {
                customer_id: customer || data.admin_id,
                store_id: store,
                courier_id: courier || null,
              },
              "Compra de teste liberada por 24 horas. Abra a loja no aplicativo do cliente.",
            );
          }}
        >
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
                required
                className={selectClass}
                value={store}
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
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="test-courier">Entregador do teste</Label>
              <select
                id="test-courier"
                className={selectClass}
                value={courier}
                onChange={(e) => setCourier(e.target.value)}
              >
                <option value="">Sem entregador (somente retirada)</option>
                {data.couriers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome || p.id.slice(0, 8)} · {p.status}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Use contas de teste. A loja precisa estar aberta. Para entrega, o entregador selecionado
            precisa estar online, aprovado e atuar na cidade da loja. A autorização expira em 24
            horas; desligar o modo bloqueia novas compras de teste.
          </p>
          <Button type="submit" disabled={!!busy || !store} loading={busy === "enroll"}>
            Liberar compra de teste
          </Button>
        </form>
      )}
      {data.testers.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Contas liberadas</h3>
          {data.testers.map((tester) => (
            <div
              key={tester.customer_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
            >
              <p className="text-sm">
                {tester.customer || tester.customer_id.slice(0, 8)} · {tester.store}
                <span className="block text-xs text-muted-foreground">
                  Até {new Date(tester.expires_at).toLocaleString("pt-BR")}
                </span>
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={() =>
                  void run(
                    "revoke",
                    { customer_id: tester.customer_id },
                    "Autorização de teste removida.",
                  )
                }
              >
                Remover autorização
              </Button>
            </div>
          ))}
        </div>
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
