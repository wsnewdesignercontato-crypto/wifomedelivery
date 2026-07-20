import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bike, MapPin, Package, CheckCircle2, Phone, MessageSquare, Navigation, Clock, ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useMyCourier, fmt } from "@/hooks/use-courier";

export const Route = createFileRoute("/_authenticated/entregador/corridas")({
  component: Corridas,
});

type Delivery = {
  id: string; order_id: string; status: string; valor_entrega_cents: number; entregador_id: string | null;
  aceito_em: string | null; coletado_em: string | null; entregue_em: string | null;
};
type OrderLite = {
  id: string; establishment_id: string; total_cents: number; cliente_id: string;
  endereco_entrega: { endereco?: string; bairro?: string; complemento?: string } | null;
  codigo_entrega: string | null; observacoes: string | null; forma_pagamento: string;
};
type Estab = { id: string; nome: string; endereco: string | null; cidade: string | null; telefone?: string | null };
type ClienteInfo = { nome: string | null; telefone: string | null };

const STAGES = [
  { key: "accepted", label: "Aceito", next: "to_store", cta: "Iniciar rota até a loja" },
  { key: "to_store", label: "A caminho da loja", next: "at_store", cta: "Cheguei na loja" },
  { key: "at_store", label: "Na loja", next: "picked_up", cta: "Pedido coletado" },
  { key: "picked_up", label: "Coletado", next: "to_customer", cta: "Iniciar rota até o cliente" },
  { key: "to_customer", label: "A caminho do cliente", next: "at_customer", cta: "Cheguei no cliente" },
  { key: "at_customer", label: "No cliente", next: "delivered", cta: "Confirmar entrega" },
];
const ORDER_MAP: Record<string, string> = {
  to_store: "courier_assigned", at_store: "courier_assigned",
  picked_up: "picked_up", to_customer: "on_the_way",
  at_customer: "arriving", delivered: "delivered",
};

function Corridas() {
  const { courier } = useMyCourier();
  const [disponiveis, setDisponiveis] = useState<Delivery[]>([]);
  const [ativa, setAtiva] = useState<Delivery | null>(null);
  const [order, setOrder] = useState<OrderLite | null>(null);
  const [estab, setEstab] = useState<Estab | null>(null);
  const [cliente, setCliente] = useState<ClienteInfo | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [advancing, setAdvancing] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  async function load() {
    if (!courier) return;
    const { data: dv } = await supabase
      .from("deliveries")
      .select("id,order_id,status,valor_entrega_cents,entregador_id,aceito_em,coletado_em,entregue_em")
      .eq("status", "broadcasting")
      .or(`entregador_id.is.null,entregador_id.eq.${courier.user_id}`)
      .order("created_at", { ascending: false });
    setDisponiveis((dv ?? []) as Delivery[]);

    const { data: at } = await supabase
      .from("deliveries")
      .select("id,order_id,status,valor_entrega_cents,entregador_id,aceito_em,coletado_em,entregue_em")
      .eq("entregador_id", courier.user_id)
      .not("status", "in", "(delivered,cancelled)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setAtiva((at as Delivery) ?? null);

    if (at) {
      const { data: o } = await supabase.from("orders")
        .select("id,establishment_id,total_cents,cliente_id,endereco_entrega,codigo_entrega,observacoes,forma_pagamento")
        .eq("id", at.order_id).maybeSingle();
      setOrder(o as OrderLite);
      if (o) {
        const [{ data: e }, { data: c }] = await Promise.all([
          supabase.from("establishments").select("id,nome,endereco,cidade,telefone").eq("id", o.establishment_id).maybeSingle(),
          supabase.from("profiles").select("nome,telefone").eq("id", o.cliente_id).maybeSingle(),
        ]);
        setEstab(e as Estab);
        setCliente((c as ClienteInfo) ?? null);
      }
    } else { setOrder(null); setEstab(null); setCliente(null); }
  }

  useEffect(() => {
    if (!courier) return;
    load();
    const ch = supabase.channel("courier-corridas-" + courier.user_id)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courier?.user_id]);

  // GPS tracking enquanto há corrida ativa em campo (to_store → at_customer)
  useEffect(() => {
    const shouldTrack = ativa && ["to_store","at_store","picked_up","to_customer","at_customer"].includes(ativa.status);
    if (!shouldTrack || !courier || !("geolocation" in navigator)) {
      if (watchIdRef.current != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
      return;
    }
    let lastSent = 0;
    watchIdRef.current = navigator.geolocation.watchPosition(async (pos) => {
      const now = Date.now();
      if (now - lastSent < 12000) return;
      lastSent = now;
      const { latitude: lat, longitude: lng, accuracy, heading, speed } = pos.coords;
      await Promise.all([
        supabase.from("deliveries").update({ lat, lng }).eq("id", ativa!.id),
        supabase.from("tracking_points").insert({
          courier_id: courier.user_id, order_id: ativa!.order_id,
          lat, lng, accuracy: accuracy ?? null, heading: heading ?? null, speed: speed ?? null,
        }),
        supabase.from("courier_profiles").update({ lat, lng, last_seen: new Date().toISOString() }).eq("user_id", courier.user_id),
      ]);
    }, (err) => console.warn("GPS error", err), { enableHighAccuracy: true, maximumAge: 8000, timeout: 20000 });
    return () => { if (watchIdRef.current != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; } };
  }, [ativa?.id, ativa?.status, courier?.user_id]);

  async function aceitar(d: Delivery) {
    if (!courier) return;
    if (ativa) return toast.error("Finalize sua corrida atual antes");
    const { data, error } = await supabase.from("deliveries")
      .update({ entregador_id: courier.user_id, status: "accepted", aceito_em: new Date().toISOString() })
      .eq("id", d.id).eq("status", "broadcasting").select("*").maybeSingle();
    if (error || !data) return toast.error("Corrida indisponível");
    await supabase.from("orders").update({ status: "courier_assigned" }).eq("id", d.order_id);
    await supabase.from("courier_profiles").update({ status: "ocupado" }).eq("user_id", courier.user_id);
    toast.success("Corrida aceita!");
    load();
  }

  async function avancar(next: string) {
    if (!ativa || !courier || advancing) return;
    if (next === "delivered") { setCodeInput(""); setCodeOpen(true); return; }
    setAdvancing(true);
    const patch: Record<string, unknown> = { status: next };
    if (next === "picked_up") patch.coletado_em = new Date().toISOString();
    const { error } = await supabase.from("deliveries").update(patch as never).eq("id", ativa.id);
    if (error) { setAdvancing(false); return toast.error("Falha ao atualizar"); }
    if (ORDER_MAP[next]) await supabase.from("orders").update({ status: ORDER_MAP[next] as never }).eq("id", ativa.order_id);
    setAdvancing(false);
    load();
  }

  async function confirmarEntrega() {
    if (!ativa || !order || !courier) return;
    if (order.codigo_entrega && codeInput.trim() !== order.codigo_entrega) {
      return toast.error("Código incorreto");
    }
    setAdvancing(true);
    const { error } = await supabase.from("deliveries").update({
      status: "delivered", entregue_em: new Date().toISOString(),
    }).eq("id", ativa.id);
    if (error) { setAdvancing(false); return toast.error("Falha ao finalizar"); }
    await supabase.from("orders").update({ status: "delivered" }).eq("id", ativa.order_id);
    await supabase.from("courier_profiles").update({ status: "online" }).eq("user_id", courier.user_id);
    setAdvancing(false);
    setCodeOpen(false);
    toast.success("Entrega concluída! 🎉");
    load();
  }

  const currentStageIdx = ativa ? STAGES.findIndex((s) => s.key === ativa.status) : -1;
  const currentStage = currentStageIdx >= 0 ? STAGES[currentStageIdx] : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">Corridas</h1>

      {ativa && (
        <section className="rounded-2xl border-2 border-primary bg-card p-4 shadow-brand">
          <div className="flex items-center justify-between">
            <Badge className="bg-primary text-primary-foreground">Corrida ativa</Badge>
            <span className="font-bold text-primary">{fmt(ativa.valor_entrega_cents)}</span>
          </div>

          {/* Timeline */}
          <div className="mt-4">
            <div className="flex items-center gap-1">
              {STAGES.map((s, i) => {
                const done = i < currentStageIdx;
                const active = i === currentStageIdx;
                return (
                  <div key={s.key} className="flex flex-1 items-center">
                    <div className={`h-2 flex-1 rounded-full ${done || active ? "bg-primary" : "bg-muted"}`} />
                    {i < STAGES.length - 1 && <div className="w-0.5" />}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs font-semibold text-muted-foreground">
              Etapa {Math.max(1, currentStageIdx + 1)} de {STAGES.length} · {currentStage?.label}
            </p>
          </div>

          {order && estab && (
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
                  <Package className="h-3.5 w-3.5" /> Loja
                </p>
                <p className="font-semibold">{estab.nome}</p>
                <p className="text-xs text-muted-foreground">{estab.endereco ?? "—"} {estab.cidade && `· ${estab.cidade}`}</p>
                {estab.telefone && (
                  <a href={`tel:${estab.telefone}`}>
                    <Button size="sm" variant="outline" className="mt-2"><Phone className="mr-2 h-3 w-3" />Ligar</Button>
                  </a>
                )}
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" /> Cliente
                </p>
                <p className="font-semibold">{cliente?.nome ?? "Cliente"}</p>
                <p className="text-xs text-muted-foreground">
                  {order.endereco_entrega?.endereco ?? "—"}
                  {order.endereco_entrega?.complemento && ` · ${order.endereco_entrega.complemento}`}
                </p>
                <div className="mt-2 flex gap-2">
                  {cliente?.telefone && (
                    <a href={`tel:${cliente.telefone}`}>
                      <Button size="sm" variant="outline"><Phone className="mr-2 h-3 w-3" />Ligar</Button>
                    </a>
                  )}
                  <Button size="sm" variant="outline"><MessageSquare className="mr-2 h-3 w-3" />Chat</Button>
                </div>
              </div>
              {order.observacoes && (
                <div className="md:col-span-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                  <strong>Observações:</strong> {order.observacoes}
                </div>
              )}
              <div className="md:col-span-2 flex items-center justify-between rounded-xl border border-border bg-background p-3 text-xs">
                <span className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" /> Pagamento: <strong className="text-foreground">{order.forma_pagamento}</strong></span>
                <span>Total pedido: <strong className="text-foreground">{fmt(order.total_cents)}</strong></span>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {currentStage && (
              <Button size="lg" className="flex-1 min-w-[220px]" onClick={() => avancar(currentStage.next)} disabled={advancing}>
                {advancing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : currentStage.key === "at_customer" ? <ShieldCheck className="mr-2 h-4 w-4" /> : <Navigation className="mr-2 h-4 w-4" />}
                {currentStage.cta}
              </Button>
            )}
          </div>
        </section>
      )}

      {!ativa && (
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
                    <p className="font-semibold">
                      {d.entregador_id === courier?.user_id ? "🎯 Chamado direto para você" : "Corrida disponível"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Aceite antes que outro entregador</p>
                  </div>
                  <span className="font-bold text-primary">{fmt(d.valor_entrega_cents)}</span>
                </div>
                <div className="mt-3">
                  <Button className="w-full" onClick={() => aceitar(d)}>Aceitar corrida</Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <Dialog open={codeOpen} onOpenChange={setCodeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar entrega</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Peça ao cliente o <strong className="text-foreground">código de 4 dígitos</strong> mostrado no app dele e digite abaixo para finalizar a corrida.
            </p>
            <Input
              inputMode="numeric" maxLength={4} placeholder="0000"
              value={codeInput} onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="text-center text-3xl font-black tracking-[0.5em]"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCodeOpen(false)}>Cancelar</Button>
            <Button onClick={confirmarEntrega} disabled={advancing || codeInput.length !== 4}>
              {advancing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Confirmar entrega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
