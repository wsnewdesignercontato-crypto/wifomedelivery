import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LogOut, Bike, Loader2, MapPin, Package, CheckCircle2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { IFomeLogo } from "@/components/ifome-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/entregador")({
  component: EntregadorApp,
});

type Courier = {
  user_id: string;
  cnh: string | null;
  veiculo: string | null;
  placa: string | null;
  pix_key: string | null;
  status: "pendente" | "aprovado" | "online" | "offline" | "ocupado" | "bloqueado";
};

type Delivery = {
  id: string;
  order_id: string;
  status: string;
  valor_entrega_cents: number;
  entregador_id: string | null;
};

type OrderLite = {
  id: string;
  establishment_id: string;
  total_cents: number;
  endereco_entrega: { endereco?: string } | null;
};

type Estab = { id: string; nome: string; endereco: string | null; cidade: string | null };

const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const DELIV_LABEL: Record<string, string> = {
  broadcasting: "Disponível",
  accepted: "Aceita",
  to_store: "A caminho da loja",
  at_store: "Na loja",
  picked_up: "Coletado",
  to_customer: "A caminho do cliente",
  at_customer: "No cliente",
  delivered: "Entregue",
  cancelled: "Cancelada",
};

function EntregadorApp() {
  const { user } = Route.useRouteContext() as { user: { id: string } };
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [courier, setCourier] = useState<Courier | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("courier_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      setCourier(data as Courier | null);
      setLoading(false);
    })();
  }, [user.id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <IFomeLogo size="sm" />
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/", replace: true });
            }}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {!courier ? (
          <CadastroCourier userId={user.id} onCreated={setCourier} />
        ) : (
          <PainelEntregador courier={courier} setCourier={setCourier} />
        )}
      </main>
    </div>
  );
}

function CadastroCourier({ userId, onCreated }: { userId: string; onCreated: (c: Courier) => void }) {
  const [form, setForm] = useState({ veiculo: "moto", placa: "", cnh: "", pix: "" });
  const [saving, setSaving] = useState(false);

  async function salvar() {
    setSaving(true);
    const { data, error } = await supabase
      .from("courier_profiles")
      .insert({
        user_id: userId,
        veiculo: form.veiculo,
        placa: form.placa || null,
        cnh: form.cnh || null,
        pix_key: form.pix || null,
        status: "aprovado",
      })
      .select("*")
      .single();
    setSaving(false);
    if (error || !data) return toast.error("Falha ao cadastrar");
    toast.success("Cadastro criado! Fique online para aceitar corridas.");
    onCreated(data as Courier);
  }

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-6 shadow-card">
      <div className="mb-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-brand text-primary-foreground shadow-brand">
          <Bike className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-2xl font-black tracking-tight">Cadastro de entregador</h1>
        <p className="mt-1 text-sm text-muted-foreground">Só faltam alguns dados para você começar a rodar.</p>
      </div>
      <div className="space-y-3">
        <div>
          <Label>Veículo</Label>
          <Input value={form.veiculo} onChange={(e) => setForm({ ...form, veiculo: e.target.value })} />
        </div>
        <div>
          <Label>Placa</Label>
          <Input value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value })} />
        </div>
        <div>
          <Label>CNH</Label>
          <Input value={form.cnh} onChange={(e) => setForm({ ...form, cnh: e.target.value })} />
        </div>
        <div>
          <Label>Chave PIX</Label>
          <Input value={form.pix} onChange={(e) => setForm({ ...form, pix: e.target.value })} />
        </div>
        <Button className="w-full" size="lg" onClick={salvar} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Finalizar cadastro
        </Button>
      </div>
    </div>
  );
}

function PainelEntregador({
  courier,
  setCourier,
}: {
  courier: Courier;
  setCourier: (c: Courier) => void;
}) {
  const [online, setOnline] = useState(courier.status === "online" || courier.status === "ocupado");
  const [disponiveis, setDisponiveis] = useState<Delivery[]>([]);
  const [orders, setOrders] = useState<Record<string, OrderLite>>({});
  const [estabs, setEstabs] = useState<Record<string, Estab>>({});
  const [ativa, setAtiva] = useState<Delivery | null>(null);

  async function loadDisponiveis() {
    const { data: dv } = await supabase
      .from("deliveries")
      .select("id,order_id,status,valor_entrega_cents,entregador_id")
      .eq("status", "broadcasting")
      .order("created_at", { ascending: false });
    const list = (dv ?? []) as Delivery[];
    setDisponiveis(list);
    if (list.length) {
      const oids = list.map((d) => d.order_id);
      const { data: os } = await supabase
        .from("orders")
        .select("id,establishment_id,total_cents,endereco_entrega")
        .in("id", oids);
      const om: Record<string, OrderLite> = {};
      (os ?? []).forEach((o) => (om[o.id] = o as OrderLite));
      setOrders((prev) => ({ ...prev, ...om }));
      const eids = Array.from(new Set((os ?? []).map((o) => o.establishment_id)));
      if (eids.length) {
        const { data: es } = await supabase
          .from("establishments")
          .select("id,nome,endereco,cidade")
          .in("id", eids);
        const em: Record<string, Estab> = {};
        (es ?? []).forEach((e) => (em[e.id] = e as Estab));
        setEstabs((prev) => ({ ...prev, ...em }));
      }
    }
  }

  async function loadAtiva() {
    const { data } = await supabase
      .from("deliveries")
      .select("id,order_id,status,valor_entrega_cents,entregador_id")
      .eq("entregador_id", courier.user_id)
      .not("status", "in", "(delivered,cancelled)")
      .maybeSingle();
    if (data) {
      setAtiva(data as Delivery);
      const { data: o } = await supabase
        .from("orders")
        .select("id,establishment_id,total_cents,endereco_entrega")
        .eq("id", data.order_id)
        .maybeSingle();
      if (o) {
        setOrders((prev) => ({ ...prev, [o.id]: o as OrderLite }));
        const { data: e } = await supabase
          .from("establishments")
          .select("id,nome,endereco,cidade")
          .eq("id", o.establishment_id)
          .maybeSingle();
        if (e) setEstabs((prev) => ({ ...prev, [e.id]: e as Estab }));
      }
    } else {
      setAtiva(null);
    }
  }

  useEffect(() => {
    loadAtiva();
    if (online) loadDisponiveis();
    const ch = supabase
      .channel("courier-deliveries")
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => {
        if (online) loadDisponiveis();
        loadAtiva();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, courier.user_id]);

  async function toggleOnline(v: boolean) {
    setOnline(v);
    const novoStatus = v ? "online" : "offline";
    const { data } = await supabase
      .from("courier_profiles")
      .update({ status: novoStatus, last_seen: new Date().toISOString() })
      .eq("user_id", courier.user_id)
      .select("*")
      .single();
    if (data) setCourier(data as Courier);
  }

  async function aceitar(d: Delivery) {
    const { data, error } = await supabase
      .from("deliveries")
      .update({
        entregador_id: courier.user_id,
        status: "accepted",
        aceito_em: new Date().toISOString(),
      })
      .eq("id", d.id)
      .eq("status", "broadcasting")
      .select("*")
      .maybeSingle();
    if (error || !data) return toast.error("Corrida já foi aceita por outro entregador");
    await supabase.from("orders").update({ status: "courier_assigned" }).eq("id", d.order_id);
    await supabase.from("courier_profiles").update({ status: "ocupado" }).eq("user_id", courier.user_id);
    toast.success("Corrida aceita!");
    loadAtiva();
    loadDisponiveis();
  }

  async function avancar(next: "to_store" | "at_store" | "picked_up" | "to_customer" | "at_customer" | "delivered") {
    if (!ativa) return;
    const patch: {
      status: typeof next;
      coletado_em?: string;
      entregue_em?: string;
    } = { status: next };
    if (next === "picked_up") patch.coletado_em = new Date().toISOString();
    if (next === "delivered") patch.entregue_em = new Date().toISOString();
    await supabase.from("deliveries").update(patch).eq("id", ativa.id);
    const orderMap = {
      to_store: "courier_assigned",
      picked_up: "picked_up",
      to_customer: "on_the_way",
      at_customer: "arriving",
      delivered: "delivered",
    } as const;
    if (next in orderMap) {
      const os = orderMap[next as keyof typeof orderMap];
      await supabase.from("orders").update({ status: os }).eq("id", ativa.order_id);
    }
    if (next === "delivered") {
      await supabase.from("courier_profiles").update({ status: "online" }).eq("user_id", courier.user_id);
      toast.success("Entrega concluída!");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-brand text-primary-foreground">
            <Bike className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold">Você está {online ? "Online" : "Offline"}</p>
            <p className="text-xs text-muted-foreground">
              {online ? "Recebendo corridas em tempo real" : "Ative para começar a receber"}
            </p>
          </div>
        </div>
        <Switch checked={online} onCheckedChange={toggleOnline} />
      </div>

      {ativa ? (
        <div className="rounded-2xl border-2 border-primary bg-card p-4 shadow-brand">
          <div className="flex items-center justify-between">
            <Badge className="bg-primary text-primary-foreground">Corrida ativa</Badge>
            <span className="font-bold text-primary">{fmt(ativa.valor_entrega_cents)}</span>
          </div>
          {orders[ativa.order_id] && estabs[orders[ativa.order_id].establishment_id] && (
            <div className="mt-3 space-y-2 text-sm">
              <p className="flex items-start gap-2">
                <Package className="mt-0.5 h-4 w-4 text-primary" />
                <span>
                  <strong>Loja:</strong> {estabs[orders[ativa.order_id].establishment_id].nome}
                  {estabs[orders[ativa.order_id].establishment_id].endereco &&
                    ` — ${estabs[orders[ativa.order_id].establishment_id].endereco}`}
                </span>
              </p>
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                <span>
                  <strong>Cliente:</strong>{" "}
                  {orders[ativa.order_id].endereco_entrega?.endereco ?? "—"}
                </span>
              </p>
            </div>
          )}
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Status: {DELIV_LABEL[ativa.status] ?? ativa.status}
            </p>
            <div className="flex flex-wrap gap-2">
              {ativa.status === "accepted" && (
                <Button size="sm" onClick={() => avancar("to_store")}>
                  A caminho da loja
                </Button>
              )}
              {ativa.status === "to_store" && (
                <Button size="sm" onClick={() => avancar("at_store")}>
                  Cheguei na loja
                </Button>
              )}
              {ativa.status === "at_store" && (
                <Button size="sm" onClick={() => avancar("picked_up")}>
                  Pedido coletado
                </Button>
              )}
              {ativa.status === "picked_up" && (
                <Button size="sm" onClick={() => avancar("to_customer")}>
                  A caminho do cliente
                </Button>
              )}
              {ativa.status === "to_customer" && (
                <Button size="sm" onClick={() => avancar("at_customer")}>
                  Cheguei no cliente
                </Button>
              )}
              {ativa.status === "at_customer" && (
                <Button size="sm" onClick={() => avancar("delivered")}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Confirmar entrega
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : online ? (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            Corridas disponíveis ({disponiveis.length})
          </h2>
          <div className="space-y-3">
            {disponiveis.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
                <Bike className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Nenhuma corrida no momento. Assim que uma loja chamar, aparece aqui.
                </p>
              </div>
            )}
            {disponiveis.map((d) => {
              const o = orders[d.order_id];
              const e = o ? estabs[o.establishment_id] : null;
              return (
                <div key={d.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{e?.nome ?? "Restaurante"}</p>
                      <p className="text-xs text-muted-foreground">
                        Retirada: {e?.endereco ?? "—"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Entrega em: {o?.endereco_entrega?.endereco ?? "—"}
                      </p>
                    </div>
                    <span className="font-bold text-primary">{fmt(d.valor_entrega_cents)}</span>
                  </div>
                  <Button className="mt-3 w-full" onClick={() => aceitar(d)}>
                    Aceitar corrida
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Bike className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Fique online para receber corridas.
          </p>
        </div>
      )}
    </div>
  );
}
