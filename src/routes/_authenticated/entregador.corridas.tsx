import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bike, MapPin, Package, CheckCircle2, Phone, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMyCourier, fmt } from "@/hooks/use-courier";

export const Route = createFileRoute("/_authenticated/entregador/corridas")({
  component: Corridas,
});

type Delivery = { id: string; order_id: string; status: string; valor_entrega_cents: number; entregador_id: string | null };
type OrderLite = { id: string; establishment_id: string; total_cents: number; endereco_entrega: { endereco?: string } | null; cliente_id: string };
type Estab = { id: string; nome: string; endereco: string | null; cidade: string | null; telefone?: string | null };

function Corridas() {
  const { courier } = useMyCourier();
  const [disponiveis, setDisponiveis] = useState<Delivery[]>([]);
  const [ativa, setAtiva] = useState<Delivery | null>(null);
  const [order, setOrder] = useState<OrderLite | null>(null);
  const [estab, setEstab] = useState<Estab | null>(null);

  async function load() {
    if (!courier) return;
    const { data: dv } = await supabase
      .from("deliveries")
      .select("id,order_id,status,valor_entrega_cents,entregador_id")
      .eq("status", "broadcasting")
      .order("created_at", { ascending: false });
    setDisponiveis((dv ?? []) as Delivery[]);
    const { data: at } = await supabase
      .from("deliveries")
      .select("id,order_id,status,valor_entrega_cents,entregador_id")
      .eq("entregador_id", courier.user_id)
      .not("status", "in", "(delivered,cancelled)")
      .maybeSingle();
    setAtiva((at as Delivery) ?? null);
    if (at) {
      const { data: o } = await supabase.from("orders").select("*").eq("id", at.order_id).maybeSingle();
      setOrder(o as OrderLite);
      if (o) {
        const { data: e } = await supabase.from("establishments").select("id,nome,endereco,cidade,telefone").eq("id", o.establishment_id).maybeSingle();
        setEstab(e as Estab);
      }
    }
  }

  useEffect(() => {
    if (!courier) return;
    load();
    const ch = supabase.channel("courier-corridas").on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courier?.user_id]);

  async function aceitar(d: Delivery) {
    if (!courier) return;
    const { data, error } = await supabase.from("deliveries")
      .update({ entregador_id: courier.user_id, status: "accepted", aceito_em: new Date().toISOString() })
      .eq("id", d.id).eq("status", "broadcasting").select("*").maybeSingle();
    if (error || !data) return toast.error("Corrida indisponível");
    await supabase.from("orders").update({ status: "courier_assigned" }).eq("id", d.order_id);
    await supabase.from("courier_profiles").update({ status: "ocupado" }).eq("user_id", courier.user_id);
    toast.success("Corrida aceita!");
    load();
  }

  async function recusar(d: Delivery, motivo: string) {
    if (!courier) return;
    await supabase.from("notifications").insert({
      user_id: courier.user_id, titulo: "Corrida recusada", mensagem: `Motivo: ${motivo}`,
    });
    toast.info("Recusa registrada");
  }

  async function avancar(next: string) {
    if (!ativa || !courier) return;
    type Patch = { status: string; coletado_em?: string; entregue_em?: string };
    const patch: Patch = { status: next };
    if (next === "picked_up") patch.coletado_em = new Date().toISOString();
    if (next === "delivered") patch.entregue_em = new Date().toISOString();
    await supabase.from("deliveries").update(patch).eq("id", ativa.id);
    const map: Record<string, string> = { to_store: "courier_assigned", picked_up: "picked_up", to_customer: "on_the_way", at_customer: "arriving", delivered: "delivered" };
    if (map[next]) await supabase.from("orders").update({ status: map[next] }).eq("id", ativa.order_id);
    if (next === "delivered") {
      await supabase.from("courier_profiles").update({ status: "online" }).eq("user_id", courier.user_id);
      toast.success("Entrega concluída!");
    }
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">Corridas</h1>

      {ativa && (
        <section className="rounded-2xl border-2 border-primary bg-card p-4 shadow-brand">
          <div className="flex items-center justify-between">
            <Badge className="bg-primary text-primary-foreground">Corrida ativa</Badge>
            <span className="font-bold text-primary">{fmt(ativa.valor_entrega_cents)}</span>
          </div>
          {order && estab && (
            <div className="mt-3 space-y-2 text-sm">
              <p className="flex items-start gap-2"><Package className="mt-0.5 h-4 w-4 text-primary" /><span><strong>Loja:</strong> {estab.nome} — {estab.endereco ?? "—"}</span></p>
              <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-primary" /><span><strong>Cliente:</strong> {order.endereco_entrega?.endereco ?? "—"}</span></p>
              <div className="flex gap-2 pt-2">
                {estab.telefone && <a href={`tel:${estab.telefone}`}><Button size="sm" variant="outline"><Phone className="mr-2 h-4 w-4" />Loja</Button></a>}
                <Button size="sm" variant="outline"><MessageSquare className="mr-2 h-4 w-4" />Chat</Button>
              </div>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {ativa.status === "accepted" && <Button size="sm" onClick={() => avancar("to_store")}>A caminho da loja</Button>}
            {ativa.status === "to_store" && <Button size="sm" onClick={() => avancar("at_store")}>Cheguei na loja</Button>}
            {ativa.status === "at_store" && <Button size="sm" onClick={() => avancar("picked_up")}>Pedido coletado</Button>}
            {ativa.status === "picked_up" && <Button size="sm" onClick={() => avancar("to_customer")}>A caminho do cliente</Button>}
            {ativa.status === "to_customer" && <Button size="sm" onClick={() => avancar("at_customer")}>Cheguei no cliente</Button>}
            {ativa.status === "at_customer" && <Button size="sm" onClick={() => avancar("delivered")}><CheckCircle2 className="mr-2 h-4 w-4" />Confirmar entrega</Button>}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Disponíveis ({disponiveis.length})</h2>
        <div className="space-y-3">
          {disponiveis.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <Bike className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">Nenhuma corrida disponível no momento.</p>
            </div>
          )}
          {disponiveis.map((d) => (
            <div key={d.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">Corrida disponível</p>
                  <p className="text-xs text-muted-foreground mt-1">Aceite antes que outro entregador</p>
                </div>
                <span className="font-bold text-primary">{fmt(d.valor_entrega_cents)}</span>
              </div>
              <div className="mt-3 flex gap-2">
                <Button className="flex-1" onClick={() => aceitar(d)} disabled={!!ativa}>Aceitar</Button>
                <Button variant="outline" onClick={() => recusar(d, "outro")}>Recusar</Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
