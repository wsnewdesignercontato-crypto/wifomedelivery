import { useState } from "react";
import { commissionAmounts } from "@/lib/admin-commissions";
import type { AdminCommissionOrder } from "@/lib/admin-commissions";
import { fmtBRL, dateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";

export function CommissionSales({ orders }: { orders: AdminCommissionOrder[] }) {
  const [limit, setLimit] = useState(20);
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border bg-card">
      <div className="space-y-2 border-b p-5">
        <h2 className="text-lg font-bold">Comissão por venda</h2>
        <p className="text-sm text-muted-foreground">
          Veja quanto fica para a plataforma em cada pedido pago ou entregue. Antes da entrega, o
          valor é previsto. Os repasses continuam sujeitos à conferência.
        </p>
      </div>
      {!orders.length ? (
        <p className="p-5 text-sm text-muted-foreground">Nenhuma venda confirmada no período.</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr className="[&>th]:px-5 [&>th]:py-3">
                  <th scope="col">Pedido e loja</th>
                  <th scope="col">Comissão dos produtos</th>
                  <th scope="col">Taxa do frete</th>
                  <th scope="col">Total da plataforma</th>
                  <th scope="col">Etapa</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, limit).map((order) => {
                  const amounts = commissionAmounts(order);
                  return (
                    <tr key={order.id} className="border-b last:border-0 [&>td]:px-5 [&>td]:py-4">
                      <td>
                        <p className="font-semibold">{order.store_name}</p>
                        <p className="text-xs text-muted-foreground">
                          #{order.id.slice(0, 8)} · {dateTime(order.created_at)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Venda: {fmtBRL(order.total_cents)}
                        </p>
                      </td>
                      <td>
                        <p className="font-semibold">
                          {amounts ? fmtBRL(amounts.products) : "Em conferência"}
                        </p>
                        {amounts && (
                          <p className="text-xs text-muted-foreground">
                            Taxa efetiva: {amounts.productRate.toLocaleString("pt-BR")}% sobre{" "}
                            {fmtBRL(order.subtotal_cents)}
                          </p>
                        )}
                      </td>
                      <td>{amounts ? fmtBRL(amounts.freight) : "—"}</td>
                      <td className="font-bold text-primary">
                        {amounts ? fmtBRL(amounts.platform) : "—"}
                      </td>
                      <td>
                        <span className="rounded-full bg-muted px-3 py-1 text-xs">
                          {order.status === "delivered"
                            ? "Entrega concluída"
                            : "Previsto · aguardando entrega"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 p-4 md:hidden">
            {orders.slice(0, limit).map((order) => {
              const amounts = commissionAmounts(order);
              return (
                <article key={order.id} className="space-y-3 rounded-xl border p-4 text-sm">
                  <div>
                    <h3 className="font-bold">{order.store_name}</h3>
                    <p className="text-xs text-muted-foreground">
                      #{order.id.slice(0, 8)} · {dateTime(order.created_at)}
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-2">
                    <dt>
                      Produtos{" "}
                      {amounts ? `(efetiva: ${amounts.productRate.toLocaleString("pt-BR")}%)` : ""}
                    </dt>
                    <dd className="text-right">
                      {amounts ? fmtBRL(amounts.products) : "Em conferência"}
                    </dd>
                    <dt>Taxa do frete</dt>
                    <dd className="text-right">{amounts ? fmtBRL(amounts.freight) : "—"}</dd>
                    <dt className="font-semibold">Total da plataforma</dt>
                    <dd className="text-right font-bold text-primary">
                      {amounts ? fmtBRL(amounts.platform) : "—"}
                    </dd>
                  </dl>
                  <p className="text-xs text-muted-foreground">
                    {order.status === "delivered"
                      ? "Entrega concluída"
                      : "Valor previsto · aguardando entrega"}
                  </p>
                </article>
              );
            })}
          </div>
          {orders.length > limit && (
            <div className="border-t p-4">
              <Button variant="outline" onClick={() => setLimit((value) => value + 20)}>
                Mostrar mais vendas
              </Button>
            </div>
          )}
        </>
      )}
      <p className="border-t p-4 text-xs text-muted-foreground">
        As taxas de cada pedido são preservadas: alterar a configuração não recalcula vendas
        antigas. O total considera descontos custeados pela plataforma e é exibido antes das tarifas
        da Asaas.
      </p>
    </section>
  );
}
