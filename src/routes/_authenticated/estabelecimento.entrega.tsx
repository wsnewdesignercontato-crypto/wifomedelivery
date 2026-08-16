import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab, fmt } from "@/hooks/use-my-estab";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Bike, Car, Zap, Star, MapPin, Send, RefreshCw, User2 } from "lucide-react";
import { dispatchOrderDelivery } from "@/lib/delivery-dispatch";

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
  moto_eletrica: "Moto eletr.",
  bicicleta: "Bicicleta",
  bike_eletrica: "Bike eletr.",
  carro: "Carro",
};

function EntregaPage() {
  const { estab } = useMyEstab();
  const estabId = estab?.id;
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [orders, setOrders] = useState<ReadyOrder[]>([]);
  const [filter, setFilter] = useState<string>("todos");
  const [loading, setLoading] = useState(false);
  const [pickOrder, setPickOrder] = useState<Courier | null>(null);

  const loadCouriers = useCallback(async () => {
    setLoading(true);
    const { listAvailableCouriers } = await import("@/lib/couriers.functions");
    const data = await listAvailableCouriers();
    const list = (data ?? []) as Omit<Courier, "nome">[];
    const nomes: Record<string, string> = {};

    if (list.length) {
      const ids = list.map((c) => c.user_id);
      const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", ids);
      (profs ?? []).forEach((profile: { id: string; nome: string | null }) => {
        nomes[profile.id] = profile.nome || "Entregador";
      });
    }

    setCouriers(
      list.map((courier) => ({ ...courier, nome: nomes[courier.user_id] || "Entregador" })),
    );
    setLoading(false);
  }, []);

  const loadOrders = useCallback(async () => {
    if (!estabId) return;

    const { data } = await supabase
      .from("orders")
      .select("id,status,total_cents,endereco_entrega,created_at")
      .eq("establishment_id", estabId)
      .eq("tipo_entrega", "delivery")
      .in("status", ["ready", "waiting_courier"])
      .order("created_at", { ascending: false });

    setOrders((data ?? []) as ReadyOrder[]);
  }, [estabId]);

  useEffect(() => {
    void loadCouriers();
    void loadOrders();
    if (!estabId) return;

    const channel = supabase
      .channel(`estab-entrega-${estabId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "courier_profiles" },
        loadCouriers,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `establishment_id=eq.${estabId}`,
        },
        loadOrders,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [estabId, loadCouriers, loadOrders]);

  const filtrados = useMemo(() => {
    if (filter === "todos") return couriers;
    return couriers.filter((courier) => (courier.veiculo || "").toLowerCase() === filter);
  }, [couriers, filter]);

  async function chamarBroadcast(orderId: string) {
    if (!estab) return;

    try {
      const result = await dispatchOrderDelivery({
        orderId,
        feeCents: estab.taxa_entrega_cents,
      });

      if (result === "exists") {
        toast.info("Ja existe uma corrida para este pedido");
        return;
      }

      toast.success("Corrida enviada para os entregadores");
      loadOrders();
    } catch (dispatchError) {
      const message =
        dispatchError instanceof Error ? dispatchError.message : "Falha ao chamar entregador";
      toast.error(message);
    }
  }

  async function chamarDirecionado(orderId: string, courier: Courier) {
    if (!estab) return;

    try {
      const result = await dispatchOrderDelivery({
        orderId,
        feeCents: estab.taxa_entrega_cents,
        courierId: courier.user_id,
      });

      if (result === "exists") {
        toast.info("Este pedido ja tem entregador");
        setPickOrder(null);
        return;
      }

      toast.success(`Enviado para ${courier.nome}`);
      setPickOrder(null);
      loadOrders();
    } catch (dispatchError) {
      const message =
        dispatchError instanceof Error ? dispatchError.message : "Falha ao chamar entregador";
      toast.error(message);
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Area de entrega</h1>
          <p className="text-sm text-muted-foreground">
            Chame um motoboy, bike ou carro para os seus pedidos prontos.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            loadCouriers();
            loadOrders();
          }}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Pedidos prontos para envio
        </h2>
        {orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhum pedido aguardando entregador.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {orders.map((order) => (
              <div key={order.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">#{order.id.slice(0, 8)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <MapPin className="mr-1 inline h-3 w-3" />
                      {order.endereco_entrega?.endereco ||
                        order.endereco_entrega?.bairro ||
                        "Endereco do cliente"}
                    </p>
                    <p className="mt-1 text-sm font-bold text-primary">{fmt(order.total_cents)}</p>
                  </div>
                  <Badge variant={order.status === "waiting_courier" ? "secondary" : "default"}>
                    {order.status === "waiting_courier" ? "Aguardando" : "Pronto"}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => chamarBroadcast(order.id)} className="flex-1">
                    <Send className="mr-2 h-4 w-4" />
                    Chamar entregador
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Entregadores online <span className="text-foreground">({couriers.length})</span>
          </h2>
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList>
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="moto">Moto</TabsTrigger>
              <TabsTrigger value="moto_eletrica">Moto elet.</TabsTrigger>
              <TabsTrigger value="bicicleta">Bike</TabsTrigger>
              <TabsTrigger value="bike_eletrica">Bike elet.</TabsTrigger>
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
            {filtrados.map((courier) => {
              const Icon = VEHICLE_ICON[courier.veiculo || ""] || Bike;

              return (
                <div
                  key={courier.user_id}
                  className="rounded-2xl border border-border bg-card p-4 transition hover:border-primary"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <User2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{courier.nome}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                        <span>
                          {VEHICLE_LABEL[courier.veiculo || ""] || courier.veiculo || "Veiculo"}
                        </span>
                        {courier.avaliacao != null && (
                          <span className="flex items-center gap-0.5">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            {Number(courier.avaliacao).toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="h-2 w-2 rounded-full bg-emerald-500" title="Online" />
                  </div>
                  <Button
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => setPickOrder(courier)}
                    disabled={orders.length === 0}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Pedir para este
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Dialog open={!!pickOrder} onOpenChange={(open) => !open && setPickOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar para {pickOrder?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {orders.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum pedido disponivel.</p>
            )}
            {orders.map((order) => (
              <button
                key={order.id}
                onClick={() => pickOrder && chamarDirecionado(order.id, pickOrder)}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-background p-3 text-left hover:border-primary"
              >
                <div>
                  <p className="font-semibold">#{order.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">
                    {order.endereco_entrega?.endereco ||
                      order.endereco_entrega?.bairro ||
                      "Endereco do cliente"}
                  </p>
                </div>
                <span className="text-sm font-bold text-primary">{fmt(order.total_cents)}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickOrder(null)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
