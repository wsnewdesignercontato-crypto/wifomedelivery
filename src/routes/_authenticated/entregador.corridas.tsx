import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

const codigoEntregaSchema = z
  .string()
  .trim()
  .regex(/^\d{4}$/, { message: "O código deve ter exatamente 4 dígitos numéricos." });
import { Bike, MapPin, Package, CheckCircle2, Phone, MessageSquare, Navigation, Clock, ShieldCheck, Loader2, Camera, Banknote, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMyCourier, fmt } from "@/hooks/use-courier";
import { OrderChat } from "@/components/order-chat";
import { SOSButton } from "@/components/sos-button";

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
  troco_para_cents: number | null;
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

const INCIDENT_TYPES = [
  { k: "endereco_errado", label: "Endereço errado" },
  { k: "cliente_ausente", label: "Cliente ausente" },
  { k: "produto_avariado", label: "Produto avariado" },
  { k: "acidente", label: "Acidente / pane" },
  { k: "recusa", label: "Cliente recusou" },
  { k: "outro", label: "Outro" },
];

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
  const [chatOpen, setChatOpen] = useState<"client_courier" | "store_courier" | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeAttempts, setCodeAttempts] = useState(0);
  const [deliveredInfo, setDeliveredInfo] = useState<{ valorCents: number; clienteNome: string | null } | null>(null);
  
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [incidentType, setIncidentType] = useState("cliente_ausente");
  const [incidentText, setIncidentText] = useState("");
  const [savingIncident, setSavingIncident] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [availMeta, setAvailMeta] = useState<Record<string, { nome: string; distKm: number | null }>>({});

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setMyPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 8000 },
    );
  }, []);

  function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  async function load() {
    if (!courier) return;
    const { data: dv } = await supabase
      .from("deliveries")
      .select("id,order_id,status,valor_entrega_cents,entregador_id,aceito_em,coletado_em,entregue_em")
      .eq("status", "broadcasting")
      .or(`entregador_id.is.null,entregador_id.eq.${courier.user_id}`)
      .order("created_at", { ascending: false });
    setDisponiveis((dv ?? []) as Delivery[]);

    // Metadados (nome da loja + distância até a coleta)
    const dvList = (dv ?? []) as Delivery[];
    if (dvList.length) {
      const orderIds = dvList.map((d) => d.order_id);
      const { data: ords } = await supabase
        .from("orders")
        .select("id, establishment_id")
        .in("id", orderIds);
      const estabIds = Array.from(new Set((ords ?? []).map((o: any) => o.establishment_id)));
      const { data: estabs } = estabIds.length
        ? await supabase.from("establishments").select("id, nome, lat, lng").in("id", estabIds)
        : { data: [] as any[] };
      const estabById: Record<string, { nome: string; lat: number | null; lng: number | null }> = {};
      (estabs ?? []).forEach((e: any) => { estabById[e.id] = { nome: e.nome, lat: e.lat, lng: e.lng }; });
      const orderToEstab: Record<string, string> = {};
      (ords ?? []).forEach((o: any) => { orderToEstab[o.id] = o.establishment_id; });
      const meta: Record<string, { nome: string; distKm: number | null }> = {};
      for (const d of dvList) {
        const eid = orderToEstab[d.order_id];
        const e = eid ? estabById[eid] : undefined;
        let distKm: number | null = null;
        if (myPos && e && e.lat != null && e.lng != null) {
          distKm = Math.round(haversineKm(myPos, { lat: e.lat, lng: e.lng }) * 10) / 10;
        }
        meta[d.id] = { nome: e?.nome ?? "Loja", distKm };
      }
      setAvailMeta(meta);
    } else {
      setAvailMeta({});
    }

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
        .select("id,establishment_id,total_cents,cliente_id,endereco_entrega,codigo_entrega,observacoes,forma_pagamento,troco_para_cents")
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
    if (next === "delivered") { setCodeOpen(true); return; }
    setAdvancing(true);
    const patch: Record<string, unknown> = { status: next };
    if (next === "picked_up") patch.coletado_em = new Date().toISOString();
    const { error } = await supabase.from("deliveries").update(patch as never).eq("id", ativa.id);
    if (error) { setAdvancing(false); return toast.error("Falha ao atualizar"); }
    if (ORDER_MAP[next]) await supabase.from("orders").update({ status: ORDER_MAP[next] as never }).eq("id", ativa.order_id);
    setAdvancing(false);
    load();
  }

  function pickProof(f: File) {
    if (f.size > 5 * 1024 * 1024) return toast.error("Foto muito grande (máx 5MB)");
    setProofFile(f);
    setProofPreview(URL.createObjectURL(f));
  }

  async function confirmarEntrega() {
    if (!ativa || !order || !courier) return;
    if (!order.codigo_entrega) {
      const msg = "Pedido sem código de entrega. Contate o suporte.";
      setCodeError(msg);
      return toast.error(msg);
    }
    // Validação de formato (zod)
    const parsed = codigoEntregaSchema.safeParse(codeInput);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Código inválido.";
      setCodeError(msg);
      return toast.error(msg);
    }
    // Comparação com o código real do pedido
    if (parsed.data !== order.codigo_entrega) {
      const nextAttempts = codeAttempts + 1;
      setCodeAttempts(nextAttempts);
      const msg = `Código incorreto. Peça novamente ao cliente os 4 dígitos que aparecem na tela dele.${
        nextAttempts >= 3 ? " (várias tentativas — confirme com o cliente)" : ""
      }`;
      setCodeError(msg);
      setCodeInput("");
      return toast.error("Código incorreto", { description: "Peça ao cliente o código de 4 dígitos correto." });
    }
    setCodeError(null);
    setCodeAttempts(0);
    setAdvancing(true);
    let prova_url: string | null = null;
    let metodo: string = "code";
    if (proofFile) {
      const path = `${courier.user_id}/${order.id}/${Date.now()}-${proofFile.name}`;
      const up = await supabase.storage.from("delivery-proofs").upload(path, proofFile);
      if (up.error) { setAdvancing(false); return toast.error("Falha ao enviar foto"); }
      const { data: signed } = await supabase.storage.from("delivery-proofs").createSignedUrl(path, 60 * 60 * 24 * 30);
      prova_url = signed?.signedUrl ?? path;
      metodo = "code+photo";
    }
    const orderPatch: Record<string, unknown> = {
      status: "delivered",
      entrega_metodo_prova: metodo,
      dinheiro_recebido: order.forma_pagamento === "dinheiro",
    };
    if (prova_url) orderPatch.prova_url = prova_url;


    const { error } = await supabase.from("deliveries").update({
      status: "delivered", entregue_em: new Date().toISOString(),
    }).eq("id", ativa.id);
    if (error) { setAdvancing(false); return toast.error("Falha ao finalizar"); }
    await supabase.from("orders").update(orderPatch as never).eq("id", ativa.order_id);
    await supabase.from("courier_profiles").update({ status: "online" }).eq("user_id", courier.user_id);

    // Atualização imediata do estado local + confirmação visual
    const valorCents = ativa.valor_entrega_cents ?? 0;
    const clienteNome = cliente?.nome ?? null;
    setAdvancing(false);
    setCodeOpen(false);
    setCodeInput("");
    setProofFile(null);
    setProofPreview(null);
    setAtiva(null);
    setOrder(null);
    setEstab(null);
    setCliente(null);
    setDeliveredInfo({ valorCents, clienteNome });
    toast.success("Entrega confirmada! 🎉", {
      description: `Código validado. +R$ ${(valorCents / 100).toFixed(2).replace(".", ",")} adicionados à sua carteira.`,
    });
    load();
  }

  async function salvarIncidente() {
    if (!ativa || !order || !courier) return;
    setSavingIncident(true);
    const { error } = await supabase.from("order_incidents").insert({
      order_id: order.id,
      entregador_id: courier.user_id,
      tipo: incidentType,
      descricao: incidentText.trim() || null,
    });

    setSavingIncident(false);
    if (error) return toast.error("Falha ao registrar");
    toast.success("Ocorrência registrada. Suporte foi notificado.");
    setIncidentOpen(false);
    setIncidentText("");
  }

  const currentStageIdx = ativa ? STAGES.findIndex((s) => s.key === ativa.status) : -1;
  const currentStage = currentStageIdx >= 0 ? STAGES[currentStageIdx] : null;
  const trocoDevolver = order && order.forma_pagamento === "dinheiro" && order.troco_para_cents
    ? Math.max(0, order.troco_para_cents - order.total_cents) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Corridas</h1>
        {ativa && <SOSButton orderId={ativa.order_id} deliveryId={ativa.id} />}
      </div>

      {ativa && (
        <section className="rounded-2xl border-2 border-primary bg-card p-4 shadow-brand">
          <div className="flex items-center justify-between">
            <Badge className="bg-primary text-primary-foreground">Corrida ativa</Badge>
            <span className="font-bold text-primary">{fmt(ativa.valor_entrega_cents)}</span>
          </div>

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
                <div className="mt-2 flex gap-2">
                  {estab.telefone && (
                    <a href={`tel:${estab.telefone}`}>
                      <Button size="sm" variant="outline"><Phone className="mr-2 h-3 w-3" />Ligar</Button>
                    </a>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setChatOpen("store_courier")}>
                    <MessageSquare className="mr-2 h-3 w-3" />Chat loja
                  </Button>
                </div>
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
                  <Button size="sm" variant="outline" onClick={() => setChatOpen("client_courier")}>
                    <MessageSquare className="mr-2 h-3 w-3" />Chat cliente
                  </Button>
                </div>
              </div>
              {order.observacoes && (
                <div className="md:col-span-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                  <strong>Observações:</strong> {order.observacoes}
                </div>
              )}
              {order.forma_pagamento === "dinheiro" && (
                <div className="md:col-span-2 rounded-xl border-2 border-emerald-500/50 bg-emerald-500/10 p-3 text-sm">
                  <p className="flex items-center gap-2 font-bold text-emerald-600 dark:text-emerald-400">
                    <Banknote className="h-4 w-4" /> Pagamento em dinheiro
                  </p>
                  <p className="mt-1 text-xs">
                    Total a receber: <strong>{fmt(order.total_cents)}</strong>
                    {order.troco_para_cents ? <> · Cliente vai pagar com <strong>{fmt(order.troco_para_cents)}</strong> · <span className="text-emerald-600 dark:text-emerald-400">Levar troco: <strong>{fmt(trocoDevolver)}</strong></span></> : <> · Sem necessidade de troco</>}
                  </p>
                </div>
              )}
              <div className="md:col-span-2 flex items-center justify-between rounded-xl border border-border bg-background p-3 text-xs">
                <span className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" /> Pagamento: <strong className="text-foreground">{order.forma_pagamento}</strong></span>
                <span>Total pedido: <strong className="text-foreground">{fmt(order.total_cents)}</strong></span>
              </div>

              {currentStage?.key === "at_customer" && (
                <div className="md:col-span-2 rounded-2xl border-2 border-primary bg-primary/5 p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-primary/15 p-2 text-primary">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-primary">Código obrigatório para finalizar</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Peça ao cliente o código de 4 dígitos que aparece no pedido dele. Sem esse código, a entrega não finaliza.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase text-muted-foreground">Digite o código do cliente</label>
                      <Input
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="0000"
                        value={codeInput}
                        onChange={(e) => {
                          setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 4));
                          if (codeError) setCodeError(null);
                        }}
                        aria-invalid={!!codeError}
                        aria-describedby="codigo-erro-inline"
                        className={`h-14 text-center text-3xl font-black tracking-[0.45em] ${codeError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      />
                      {codeError && (
                        <p id="codigo-erro-inline" role="alert" className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5" /> {codeError}
                        </p>
                      )}
                    </div>
                    <Button size="lg" onClick={confirmarEntrega} disabled={advancing || codeInput.length !== 4}>
                      {advancing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      Finalizar entrega
                    </Button>
                  </div>

                  <div className="mt-3">
                    <input
                      ref={proofInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && pickProof(e.target.files[0])}
                    />
                    {proofPreview ? (
                      <div className="rounded-xl border border-border bg-background p-2">
                        <img src={proofPreview} alt="Prova de entrega" className="max-h-52 w-full rounded-lg object-cover" />
                        <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => { setProofFile(null); setProofPreview(null); }}>
                          Trocar foto da prova
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" className="w-full" onClick={() => proofInputRef.current?.click()}>
                        <Camera className="mr-2 h-4 w-4" /> Adicionar foto da entrega (opcional)
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {currentStage && (
              <Button size="lg" className="flex-1 min-w-[220px]" onClick={() => avancar(currentStage.next)} disabled={advancing}>
                {advancing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : currentStage.key === "at_customer" ? <ShieldCheck className="mr-2 h-4 w-4" /> : <Navigation className="mr-2 h-4 w-4" />}
                {currentStage.cta}
              </Button>
            )}
            <Button size="lg" variant="outline" onClick={() => setIncidentOpen(true)}>
              <AlertTriangle className="mr-2 h-4 w-4" /> Reportar problema
            </Button>
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
            {disponiveis.map((d) => {
              const m = availMeta[d.id];
              return (
                <div key={d.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">
                        {d.entregador_id === courier?.user_id ? "🎯 Chamado direto para você" : m?.nome || "Corrida disponível"}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {m?.distKm != null ? (
                          <span><b className="text-foreground">{m.distKm.toString().replace(".", ",")} km</b> até a coleta</span>
                        ) : (
                          <span>Aceite antes que outro entregador</span>
                        )}
                      </div>
                    </div>
                    <span className="font-bold text-primary shrink-0">{fmt(d.valor_entrega_cents)}</span>
                  </div>
                  <div className="mt-3">
                    <Button className="w-full" onClick={() => aceitar(d)}>Aceitar corrida</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Confirmar entrega */}
      <Dialog open={codeOpen} onOpenChange={setCodeOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirmar entrega</DialogTitle>
            <DialogDescription>
              Peça o código de 4 dígitos ao cliente e, se possível, tire uma foto do pedido entregue como prova.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              inputMode="numeric" maxLength={4} placeholder="0000"
              value={codeInput}
              onChange={(e) => {
                setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 4));
                if (codeError) setCodeError(null);
              }}
              aria-invalid={!!codeError}
              aria-describedby="codigo-erro-modal"
              className={`text-center text-3xl font-black tracking-[0.5em] ${codeError ? "border-destructive focus-visible:ring-destructive" : ""}`}
              autoFocus
            />
            {codeError && (
              <p id="codigo-erro-modal" role="alert" className="flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {codeError}
              </p>
            )}

            <div className="space-y-2">
              <p className="text-xs font-bold uppercase text-muted-foreground">Prova de entrega (opcional)</p>
              <input
                ref={proofInputRef}
                type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => e.target.files?.[0] && pickProof(e.target.files[0])}
              />
              {proofPreview ? (
                <div className="relative">
                  <img src={proofPreview} alt="prova" className="w-full rounded-xl" />
                  <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => { setProofFile(null); setProofPreview(null); }}>
                    Trocar foto
                  </Button>
                </div>
              ) : (
                <Button variant="outline" className="w-full" onClick={() => proofInputRef.current?.click()}>
                  <Camera className="mr-2 h-4 w-4" /> Tirar foto do pedido entregue
                </Button>
              )}
            </div>

            <p className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
              <strong className="text-primary">Obrigatório:</strong> peça ao cliente o código de 4 dígitos que aparece no pedido dele. Sem o código, a entrega não pode ser finalizada.
            </p>
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

      {/* Chat drawer */}
      <Sheet open={chatOpen !== null} onOpenChange={(o) => !o && setChatOpen(null)}>
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border p-4">
            <SheetTitle>{chatOpen === "client_courier" ? "Chat com o cliente" : "Chat com a loja"}</SheetTitle>
          </SheetHeader>
          {chatOpen && ativa && order && (
            <div className="flex-1 p-3">
              <OrderChat
                orderId={order.id}
                escopo={chatOpen}
                myRole="entregador"
                contactName={chatOpen === "client_courier" ? cliente?.nome : estab?.nome}
                contactPhone={chatOpen === "client_courier" ? cliente?.telefone : estab?.telefone}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Ocorrência */}
      <Dialog open={incidentOpen} onOpenChange={setIncidentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reportar problema</DialogTitle>
            <DialogDescription>Gera um protocolo para o suporte WiFome analisar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              {INCIDENT_TYPES.map((t) => (
                <button
                  key={t.k} type="button"
                  onClick={() => setIncidentType(t.k)}
                  className={`rounded-xl border-2 p-3 font-semibold transition ${
                    incidentType === t.k ? "border-primary bg-primary/10 text-primary" : "border-border bg-background"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <textarea
              className="w-full rounded-xl border border-border bg-background p-3 text-sm"
              rows={3} placeholder="Descreva o que aconteceu (opcional)"
              value={incidentText} onChange={(e) => setIncidentText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIncidentOpen(false)}>Cancelar</Button>
            <Button onClick={salvarIncidente} disabled={savingIncident}>
              {savingIncident ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deliveredInfo} onOpenChange={(o) => !o && setDeliveredInfo(null)}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">Entrega confirmada! 🎉</DialogTitle>
            <DialogDescription className="text-center">
              O código foi validado e o pedido foi marcado como <b>entregue</b>.
            </DialogDescription>
          </DialogHeader>
          <div className="my-4 flex flex-col items-center gap-2">
            <div className="h-20 w-20 rounded-full bg-green-500/15 flex items-center justify-center text-4xl">✅</div>
            {deliveredInfo?.clienteNome && (
              <p className="text-sm text-muted-foreground">Cliente: <b>{deliveredInfo.clienteNome}</b></p>
            )}
            {deliveredInfo && deliveredInfo.valorCents > 0 && (
              <p className="text-lg font-black text-primary">
                + R$ {(deliveredInfo.valorCents / 100).toFixed(2).replace(".", ",")}
              </p>
            )}
            <p className="text-xs text-muted-foreground">Você já está online para novas corridas.</p>
          </div>
          <DialogFooter>
            <button
              className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-bold"
              onClick={() => setDeliveredInfo(null)}
            >
              Fechar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
