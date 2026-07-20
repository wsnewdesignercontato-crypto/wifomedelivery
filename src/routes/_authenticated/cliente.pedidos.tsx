import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ReceiptText, Bike, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/cliente/pedidos")({
  component: PedidosPage,
});

type Order = {
  id: string;
  status: string;
  total_cents: number;
  created_at: string;
  establishment_id: string;
  tipo_entrega: "delivery" | "pickup" | null;
};

const STATUS_LABEL: Record<string, string> = {
  placed: "Recebido", accepted: "Aceito", preparing: "Em preparo", ready: "Pronto",
  waiting_courier: "Aguardando entregador", courier_assigned: "Entregador designado",
  picked_up: "Coletado", on_the_way: "A caminho", arriving: "Chegando",
  delivered: "Entregue", cancelled: "Cancelado", refunded: "Reembolsado",
};

const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function PedidosPage() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const [orders, setOrders] = useState<Order[]>([]);
  const [lojas, setLojas] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"todos" | "ativos" | "concluidos">("todos");

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("orders")
        .select("id,status,total_cents,created_at,establishment_id,tipo_entrega")
        .eq("cliente_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      const arr = (data ?? []) as Order[];
      setOrders(arr);
      const ids = Array.from(new Set(arr.map((o) => o.establishment_id)));
      if (ids.length) {
        const { data: es } = await supabase.from("establishments").select("id,nome").in("id", ids);
        const map: Record<string, string> = {};
        (es ?? []).forEach((e) => { map[e.id] = e.nome; });
        setLojas(map);
      }
      setLoading(false);
    }
    load();
    const ch = supabase
      .channel(`pedidos-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `cliente_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user.id]);

  const ACTIVE = new Set(["placed","accepted","preparing","ready","waiting_courier","courier_assigned","picked_up","on_the_way","arriving"]);
  const filtrados = orders.filter((o) => {
    if (filter === "ativos") return ACTIVE.has(o.status);
    if (filter === "concluidos") return !ACTIVE.has(o.status);
    return true;
  });

  async function repetir(o: Order) {
    const { data: items } = await supabase
      .from("order_items")
      .select("product_id,nome_snapshot,preco_unit_cents,quantidade,observacoes")
      .eq("order_id", o.id);
    if (!items || items.length === 0) { toast.error("Sem itens para repetir"); return; }

    // Verifica disponibilidade
    const pids = items.map((i) => i.product_id).filter(Boolean) as string[];
    const { data: prods } = await supabase.from("products").select("id,preco_cents,preco_promo_cents,disponivel").in("id", pids);
    const map = new Map((prods ?? []).map((p) => [p.id, p]));
    const validos = items.filter((i) => i.product_id && map.get(i.product_id!)?.disponivel);
    if (validos.length === 0) { toast.error("Nenhum item disponível"); return; }

    await supabase.from("cart_items").delete().eq("user_id", user.id);
    await supabase.from("cart_items").insert(validos.map((i) => {
      const cur = map.get(i.product_id!)!;
      return {
        user_id: user.id,
        establishment_id: o.establishment_id,
        product_id: i.product_id!,
        nome_snapshot: i.nome_snapshot,
        preco_unit_cents: cur.preco_promo_cents ?? cur.preco_cents,
        quantidade: i.quantidade,
        observacoes: i.observacoes,
      };
    }));
    toast.success("Itens adicionados ao carrinho");
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Meus pedidos</h1>
      <div className="flex gap-2">
        {(["todos","ativos","concluidos"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === f ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>
            {f === "todos" ? "Todos" : f === "ativos" ? "Em andamento" : "Concluídos"}
          </button>
        ))}
      </div>
      {filtrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <ReceiptText className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Nenhum pedido nesta lista.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map((o) => (
            <Link key={o.id} to="/cliente/pedido/$id" params={{ id: o.id }} className="block rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{lojas[o.establishment_id] ?? "Restaurante"}</p>
                  <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-primary">{fmt(o.total_cents)}</p>
                  <Badge className="mt-1 bg-primary/15 text-primary hover:bg-primary/20">{STATUS_LABEL[o.status] ?? o.status}</Badge>
                </div>
              </div>
              {(o.status === "delivered" || o.status === "cancelled") && (
                <div className="mt-3 flex justify-end">
                  <Button size="sm" variant="outline" onClick={(e) => { e.preventDefault(); repetir(o); }}>Repetir pedido</Button>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
