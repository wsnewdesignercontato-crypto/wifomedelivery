import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab, fmt } from "@/hooks/use-my-estab";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Bike, Car, Zap, Star, MapPin, Send, RefreshCw, User2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/estabelecimento/entrega")({
  component: EntregaPage,
});

type Courier = {
  user_id: string;
  nome: string;
  veiculo: string | null;
  avaliacao: number | null;
  lat: number | null;
  lng: number | null;
  last_seen: string | null;
};

type ReadyOrder = {
  id: string;
  status: string;
  total_cents: number;
  endereco_entrega: { endereco?: string; bairro?: string } | null;
  created_at: string;
};

const VEHICLE_ICON: Record<string, typeof Bike> = {
  moto: Bike,
  moto_eletrica: Zap,
  bicicleta: Bike,
  bike_eletrica: Zap,
  carro: Car,
};

const VEHICLE_LABEL: Record<string, string> = {
  moto: "Moto",
  moto_eletrica: "Moto elétrica",
  bicicleta: "Bicicleta",
  bike_eletrica: "Bike elétrica",
  carro: "Carro",
};

function EntregaPage() {
  const { estab } = useMyEstab();
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [orders, setOrders] = useState<ReadyOrder[]>([]);
  const [filter, setFilter] = useState<string>("todos");
  const [loading, setLoading] = useState(false);
  const [pickOrder, setPickOrder] = useState<Courier | null>(null);

  async function loadCouriers() {
    setLoading(true);
    const { data } = await supabase.rpc("list_available_couriers");
    const list = (data ?? []) as Omit<Courier, "nome">[];
    let nomes: Record<string, string> = {};
    if (list.length) {
      const ids = list.map((c) => c.user_id);
      const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", ids);
      (profs ?? []).forEach((p: any) => { nomes[p.id] = p.nome || "Entregador"; });
    }
    setCouriers(list.map((c) => ({ ...c, nome: nomes[c.user_id] || "Entregador" })));
    setLoading(false);
  }

  async function loadOrders() {
    if (!estab) return;
    const { data } = await supabase
      .from("orders")
      .select("id,status,total_cents,endereco_entrega,created_at")
      .eq("establishment_id", estab.id)
      .in("status", ["ready", "waiting_courier"])
      .order("created_at", { ascending: false });
    setOrders((data ?? []) as ReadyOrder[]);
  }

  useEffect(() => {
    loadCouriers();
    loadOrders();
    if (!estab) return;
    const ch = supabase
      .channel("estab-entrega-" + estab.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "courier_profiles" }, loadCouriers)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `establishment_id=eq.${estab.id}` }, loadOrders)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [estab?.id]);

  const filtrados = useMemo(() => {
    if (filter === "todos") return couriers;
    return couriers.filter((c) => (c.veiculo || "").toLowerCase() === filter);
  }, [couriers, filter]);

  async function chamarBroadcast(orderId: string) {
    if (!estab) return;
    const { data: exists } = await supabase.from("deliveries").select("id,status").eq("order_id", orderId).maybeSingle();
    if (exists && exists.status !== "cancelled") {
      toast.info("Já existe uma corrida para este pedido");
      return;
    }
    const { error } = await supabase.from("deliveries").insert({
      order_id: orderId,
      status: "broadcasting",
      valor_entrega_cents: estab.taxa_entrega_cents,
    });
    if (error) return toast.error("Falha ao chamar entregador");
    await supabase.from("orders").update({ status: "waiting_courier" }).eq("id", orderId);
    toast.success("Corrida enviada para os entregadores");
    loadOrders();
  }

  async function chamarDirecionado(orderId: string, courier: Courier) {
    if (!estab) return;
    const { data: exists } = await supabase.from("deliveries").select("id,status").eq("order_id", orderId).maybeSingle();
    if (exists && exists.status !== "cancelled") {
      toast.info("Este pedido já tem entregador");
      setPickOrder(null);
      return;
    }
    const { error } = await supabase.from("deliveries").insert({
      order_id: orderId,
      status: "broadcasting",
      entregador_id: courier.user_id,
      valor_entrega_cents: estab.taxa_entrega_cents,
    });
    if (error) return toast.error("Falha ao chamar entregador");
    await supabase.from("orders").update({ status: "waiting_courier" }).eq("id", orderId);
    toast.success(`Enviado para ${courier.nome}`);
    setPickOrder(null);
    loadOrders();
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Área de entrega</h1>
          <p className="text-sm text-muted-foreground">Chame um motoboy, bike ou carro para os seus pedidos prontos.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { loadCouriers(); loadOrders(); }}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {/* Pedidos aguardando */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Pedidos prontos para envio</h2>
        {orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhum pedido aguardando entregador.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {orders.map((o) => (
              <div key={o.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">#{o.id.slice(0, 8)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <MapPin className="mr-1 inline h-3 w-3" />
                      {o.endereco_entrega?.endereco || o.endereco_entrega?.bairro || "Endereço do cliente"}
                    </p>
                    <p className="mt-1 text-sm font-bold text-primary">{fmt(o.total_cents)}</p>
                  </div>
                  <Badge variant={o.status === "waiting_courier" ? "secondary" : "default"}>
                    {o.status === "waiting_courier" ? "Aguardando" : "Pronto"}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => chamarBroadcast(o.id)} className="flex-1">
                    <Send className="mr-2 h-4 w-4" /> Chamar entregador
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Entregadores disponíveis */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Entregadores online <span className="text-foreground">({couriers.length})</span>
          </h2>
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList>
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="moto">Moto</TabsTrigger>
              <TabsTrigger value="moto_eletrica">Moto elét.</TabsTrigger>
              <TabsTrigger value="bicicleta">Bike</TabsTrigger>
              <TabsTrigger value="bike_eletrica">Bike elét.</TabsTrigger>
              <TabsTrigger value="carro">Carro</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {filtrados.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhum entregador online neste filtro.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtrados.map((c) => {
              const Icon = VEHICLE_ICON[c.veiculo || ""] || Bike;
              return (
                <div key={c.user_id} className="rounded-2xl border border-border bg-card p-4 transition hover:border-primary">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <User2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{c.nome}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                        <span>{VEHICLE_LABEL[c.veiculo || ""] || c.veiculo || "Veículo"}</span>
                        {c.avaliacao != null && (
                          <span className="flex items-center gap-0.5">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {Number(c.avaliacao).toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="h-2 w-2 rounded-full bg-emerald-500" title="Online" />
                  </div>
                  <Button size="sm" className="mt-3 w-full" onClick={() => setPickOrder(c)} disabled={orders.length === 0}>
                    <Send className="mr-2 h-4 w-4" /> Pedir para este
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal escolher pedido */}
      <Dialog open={!!pickOrder} onOpenChange={(v) => !v && setPickOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar para {pickOrder?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {orders.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pedido disponível.</p>}
            {orders.map((o) => (
              <button
                key={o.id}
                onClick={() => pickOrder && chamarDirecionado(o.id, pickOrder)}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-background p-3 text-left hover:border-primary"
              >
                <div>
                  <p className="font-semibold">#{o.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">
                    {o.endereco_entrega?.endereco || o.endereco_entrega?.bairro || "Endereço do cliente"}
                  </p>
                </div>
                <span className="text-sm font-bold text-primary">{fmt(o.total_cents)}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickOrder(null)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
