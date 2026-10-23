import { OrderPaymentBadge } from "@/components/order-payment-badge";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

const codigoEntregaSchema = z
  .string()
  .trim()
  .regex(/^\d{4}$/, { message: "O código deve ter exatamente 4 dígitos numéricos." });
import {
  Bike,
  MapPin,
  Package,
  CheckCircle2,
  Phone,
  MessageSquare,
  Navigation,
  Clock,
  ShieldCheck,
  Loader2,
  Camera,
  Banknote,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { transitionCourierDelivery } from "@/lib/courier-delivery-transition";
import { bindResumeRefresh } from "@/lib/resume-refresh";
import { validateImageFile } from "@/lib/upload-validation";
import { ImageUploadGuidance } from "@/components/image-upload-guidance";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMyCourier, fmt } from "@/hooks/use-courier";
import { OrderChat } from "@/components/order-chat";
import { SOSButton } from "@/components/sos-button";
import { canCourierAccessRides, getCourierApprovalLabel } from "@/lib/courier-approval";
import { getCurrentDevicePosition, watchDeviceLocation } from "@/lib/device-preferences";

export const Route = createFileRoute("/_authenticated/entregador/corridas")({
  head: () => ({
    meta: [
      { title: "Entregador — Corridas | PedeTrem" },
      { name: "description", content: "PedeTrem: entregador, corridas." },
      { property: "og:title", content: "Entregador — Corridas | PedeTrem" },
      { property: "og:description", content: "PedeTrem: entregador, corridas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Corridas,
});

type Delivery = {
  is_test?: boolean;
  id: string;
  order_id: string;
  status: string;
  valor_entrega_cents: number;
  entregador_id: string | null;
  aceito_em: string | null;
  coletado_em: string | null;
  entregue_em: string | null;
};
type OrderLite = {
  is_test?: boolean;
  payment_channel?: string;
  online_payment_state?: string | null;
  id: string;
  establishment_id: string;
  total_cents: number;
  cliente_id: string;
  endereco_entrega: { endereco?: string; bairro?: string; complemento?: string } | null;
  observacoes: string | null;
  forma_pagamento: string;
  troco_para_cents: number | null;
};
type OrderMeta = { id: string; establishment_id: string };
type Estab = {
  id: string;
  nome: string;
  endereco: string | null;
  cidade: string | null;
  telefone?: string | null;
};
type EstabLocation = { id: string; nome: string; lat: number | null; lng: number | null };
type ClienteInfo = { nome: string | null; telefone: string | null };

const STAGES = [
  { key: "accepted", label: "Aceito", next: "to_store", cta: "Iniciar rota até a loja" },
  { key: "to_store", label: "A caminho da loja", next: "at_store", cta: "Cheguei na loja" },
  { key: "at_store", label: "Na loja", next: "picked_up", cta: "Pedido coletado" },
  { key: "picked_up", label: "Coletado", next: "to_customer", cta: "Iniciar rota até o cliente" },
  {
    key: "to_customer",
    label: "A caminho do cliente",
    next: "at_customer",
    cta: "Cheguei no cliente",
  },
  { key: "at_customer", label: "No cliente", next: "delivered", cta: "Confirmar entrega" },
];

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
  const canReceiveRides = canCourierAccessRides(courier);
  const [disponiveis, setDisponiveis] = useState<Delivery[]>([]);
  const [ativa, setAtiva] = useState<Delivery | null>(null);
  const [order, setOrder] = useState<OrderLite | null>(null);
  const [estab, setEstab] = useState<Estab | null>(null);
  const [cliente, setCliente] = useState<ClienteInfo | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [advancing, setAdvancing] = useState(false);
  const confirmingRef = useRef(false);
  const [chatOpen, setChatOpen] = useState<"client_courier" | "store_courier" | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [deliveredInfo, setDeliveredInfo] = useState<{
    valorCents: number;
    clienteNome: string | null;
  } | null>(null);

  const [incidentOpen, setIncidentOpen] = useState(false);
  const [incidentType, setIncidentType] = useState("cliente_ausente");
  const [incidentText, setIncidentText] = useState("");
  const [savingIncident, setSavingIncident] = useState(false);
  const stopWatchRef = useRef<(() => void) | null>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const detailsOrderIdRef = useRef<string | null>(null);
  const refreshLifetime = useRef<{ active: boolean; sequence: number; courierId: string } | null>(
    null,
  );
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [availMeta, setAvailMeta] = useState<
    Record<string, { nome: string; distKm: number | null }>
  >({});
  const [navPickerOpen, setNavPickerOpen] = useState(false);
  const [navTarget, setNavTarget] = useState<{
    next: string;
    address: string;
    label: string;
  } | null>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    getCurrentDevicePosition(
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
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  async function load() {
    const lifetime = refreshLifetime.current;
    if (!courier || !lifetime?.active || lifetime.courierId !== courier.user_id) return;
    const request = ++lifetime.sequence;
    const isCurrent = () =>
      lifetime.active && refreshLifetime.current === lifetime && request === lifetime.sequence;
    if (!canReceiveRides) {
      setDisponiveis([]);
      setAvailMeta({});
    } else {
      const { data: dv, error: availableError } = await supabase
        .from("deliveries")
        .select(
          "id,order_id,status,valor_entrega_cents,entregador_id,aceito_em,coletado_em,entregue_em,is_test",
        )
        .eq("status", "broadcasting")
        .or(`entregador_id.is.null,entregador_id.eq.${courier.user_id}`)
        .order("created_at", { ascending: false });
      if (!isCurrent()) return;
      if (!availableError) setDisponiveis((dv ?? []) as Delivery[]);

      // Metadados (nome da loja + distância até a coleta)
      const dvList = (dv ?? []) as Delivery[];
      if (dvList.length) {
        const orderIds = dvList.map((d) => d.order_id);
        const { data: ords } = await supabase
          .from("orders")
          .select("id, establishment_id,is_test")
          .in("id", orderIds);
        if (!isCurrent()) return;
        const orderRows = (ords ?? []) as OrderMeta[];
        const estabIds = Array.from(new Set(orderRows.map((o) => o.establishment_id)));
        const { data: estabs } = estabIds.length
          ? await supabase.from("establishments").select("id, nome, lat, lng").in("id", estabIds)
          : { data: [] as EstabLocation[] };
        if (!isCurrent()) return;
        const estabById: Record<string, { nome: string; lat: number | null; lng: number | null }> =
          {};
        ((estabs ?? []) as EstabLocation[]).forEach((e) => {
          estabById[e.id] = { nome: e.nome, lat: e.lat, lng: e.lng };
        });
        const orderToEstab: Record<string, string> = {};
        orderRows.forEach((o) => {
          orderToEstab[o.id] = o.establishment_id;
        });
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
      } else if (!availableError) {
        setAvailMeta({});
      }
    }

    const { data: at, error: activeError } = await supabase
      .from("deliveries")
      .select(
        "id,order_id,status,valor_entrega_cents,entregador_id,aceito_em,coletado_em,entregue_em,is_test",
      )
      .eq("entregador_id", courier.user_id)
      .in("status", ["accepted", "to_store", "at_store", "picked_up", "to_customer", "at_customer"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!isCurrent() || activeError) return;
    const nextOrderId = at?.order_id ?? null;
    if (detailsOrderIdRef.current !== nextOrderId) {
      detailsOrderIdRef.current = nextOrderId;
      setOrder(null);
      setEstab(null);
      setCliente(null);
    }
    setAtiva((at as Delivery) ?? null);

    if (at) {
      const { data: o, error: orderError } = await supabase
        .from("orders")
        .select(
          "id,establishment_id,total_cents,cliente_id,endereco_entrega,observacoes,forma_pagamento,troco_para_cents,is_test,payment_channel,online_payment_state",
        )
        .eq("id", at.order_id)
        .maybeSingle();
      if (!isCurrent() || orderError) return;
      setOrder(o as OrderLite);
      if (o) {
        const [{ data: e }, { data: c }] = await Promise.all([
          supabase
            .from("establishments")
            .select("id,nome,endereco,cidade,telefone")
            .eq("id", o.establishment_id)
            .maybeSingle(),
          supabase.from("profiles").select("nome,telefone").eq("id", o.cliente_id).maybeSingle(),
        ]);
        if (!isCurrent()) return;
        setEstab(e as Estab);
        setCliente((c as ClienteInfo) ?? null);
      }
    } else {
      setOrder(null);
      setEstab(null);
      setCliente(null);
    }
  }

  useEffect(() => {
    if (refreshLifetime.current?.courierId !== courier?.user_id) {
      detailsOrderIdRef.current = null;
      setDisponiveis([]);
      setAvailMeta({});
      setAtiva(null);
      setOrder(null);
      setEstab(null);
      setCliente(null);
    }
    if (!courier) return;
    const lifetime = { active: true, sequence: 0, courierId: courier.user_id };
    refreshLifetime.current = lifetime;
    const refresh = () => {
      if (lifetime.active) return load();
    };
    void refresh();
    const unbindResume = bindResumeRefresh(refresh);
    const ch = supabase
      .channel("courier-corridas-" + courier.user_id)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, refresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refresh();
      });
    return () => {
      lifetime.active = false;
      unbindResume();
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courier?.user_id, courier?.aprovacao, courier?.kyc_status, canReceiveRides]);

  const trackingDeliveryId = ativa?.id;
  const trackingOrderId = ativa?.order_id;
  const trackingStatus = ativa?.status;
  const trackingCourierId = courier?.user_id;
  useEffect(() => {
    const shouldTrack =
      trackingStatus &&
      ["to_store", "at_store", "picked_up", "to_customer", "at_customer"].includes(trackingStatus);
    if (
      !shouldTrack ||
      !trackingDeliveryId ||
      !trackingOrderId ||
      !trackingCourierId ||
      !("geolocation" in navigator)
    ) {
      stopWatchRef.current?.();
      stopWatchRef.current = null;
      return;
    }
    let lastSent = 0;
    stopWatchRef.current = watchDeviceLocation(
      async (pos) => {
        const now = Date.now();
        if (now - lastSent < 12000) return;
        lastSent = now;
        const { latitude: lat, longitude: lng, accuracy, heading, speed } = pos.coords;
        await Promise.all([
          supabase.from("deliveries").update({ lat, lng }).eq("id", trackingDeliveryId),
          supabase.from("tracking_points").insert({
            courier_id: trackingCourierId,
            order_id: trackingOrderId,
            lat,
            lng,
            accuracy: accuracy ?? null,
            heading: heading ?? null,
            speed: speed ?? null,
          }),
          supabase
            .from("courier_profiles")
            .update({ lat, lng, last_seen: new Date().toISOString() })
            .eq("user_id", trackingCourierId),
        ]);
      },
      (err) => console.warn("GPS error", err),
      { enableHighAccuracy: true, maximumAge: 8000, timeout: 20000 },
    );
    return () => {
      stopWatchRef.current?.();
      stopWatchRef.current = null;
    };
  }, [trackingDeliveryId, trackingOrderId, trackingStatus, trackingCourierId]);

  async function aceitar(d: Delivery) {
    if (!courier) return;
    if (!canReceiveRides) {
      return toast.error("Seu cadastro ainda não foi aprovado para receber corridas.");
    }
    if (ativa) return toast.error("Finalize sua corrida atual antes");
    try {
      await transitionCourierDelivery(d.id, "accepted");
    } catch {
      load();
      return toast.error("Corrida indisponível");
    }
    toast.success("Corrida aceita!");
    load();
  }

  async function avancar(next: string) {
    if (!ativa || !courier || advancing) return;
    if (next === "delivered") return;
    setAdvancing(true);
    try {
      await transitionCourierDelivery(ativa.id, next);
    } catch {
      toast.error("Falha ao atualizar");
    } finally {
      setAdvancing(false);
      load();
    }
  }

  function pickProof(f: File) {
    if (f.size > 5 * 1024 * 1024) return toast.error("Foto muito grande (máx 5MB)");
    setProofFile(f);
    setProofPreview(URL.createObjectURL(f));
  }

  async function confirmarEntrega() {
    if (!ativa || !order || !courier || advancing || confirmingRef.current) return;
    // Validação de formato (zod)
    const parsed = codigoEntregaSchema.safeParse(codeInput);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Código inválido.";
      setCodeError(msg);
      return toast.error(msg);
    }
    setCodeError(null);
    confirmingRef.current = true;
    setAdvancing(true);
    try {
      let prova_url: string | null = null;
      if (proofFile) {
        const invalidProof = validateImageFile(proofFile);
        if (invalidProof) {
          return toast.error(invalidProof);
        }
        const path = `${courier.user_id}/${order.id}/${Date.now()}-${proofFile.name}`;
        const up = await supabase.storage.from("delivery-proofs").upload(path, proofFile);
        if (up.error) {
          return toast.error("Falha ao enviar foto");
        }
        const { data: signed } = await supabase.storage
          .from("delivery-proofs")
          .createSignedUrl(path, 60 * 60 * 24 * 30);
        prova_url = signed?.signedUrl ?? path;
      }
      // Confirma entrega atomicamente via RPC
      const { data: rpcRes, error: rpcErr } = await supabase.rpc("confirm_delivery_code", {
        p_order_id: ativa.order_id,
        p_code: parsed.data,
        p_prova_url: prova_url ?? undefined,
      });

      const result = rpcRes && typeof rpcRes === "object" && !Array.isArray(rpcRes) ? rpcRes : null;

      if (rpcErr || (result && result.success === false)) {
        const errorMsg =
          rpcErr?.message ||
          (result && result.error === "invalid_code" ? "Código incorreto" : "Falha ao finalizar");
        setCodeError(errorMsg);
        return toast.error(errorMsg);
      }
      // A entrega já foi confirmada; falha no status não deve pedir nova confirmação.
      await supabase
        .from("courier_profiles")
        .update({ status: "online" })
        .eq("user_id", courier.user_id)
        .then(
          () => {},
          () => {},
        );

      // Atualização imediata do estado local + confirmação visual
      const valorCents = ativa.valor_entrega_cents ?? 0;
      const clienteNome = cliente?.nome ?? null;
      setCodeInput("");
      setProofFile(null);
      setProofPreview(null);
      setAtiva(null);
      setOrder(null);
      setEstab(null);
      setCliente(null);
      setDeliveredInfo({ valorCents, clienteNome });
      toast.success("Entrega confirmada! 🎉", {
        description: `Código validado. Entrega de R$ ${(valorCents / 100).toFixed(2).replace(".", ",")} registrada para conferência financeira.`,
      });
      load();
    } catch {
      const message = "Falha ao finalizar. Tente novamente.";
      setCodeError(message);
      toast.error(message);
    } finally {
      confirmingRef.current = false;
      setAdvancing(false);
    }
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
  const trocoDevolver =
    order && order.forma_pagamento === "dinheiro" && order.troco_para_cents
      ? Math.max(0, order.troco_para_cents - order.total_cents)
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          {ativa?.is_test && (
            <p className="mb-2 rounded-xl bg-amber-500/10 p-3 text-sm font-semibold text-amber-700 dark:text-amber-400">
              TESTE · Corrida simulada, sem entrega ou pagamento real.
            </p>
          )}
          <h1 className="truncate text-2xl font-black">Corridas</h1>
          <Badge variant="outline" className="border-border bg-background/70 text-foreground">
            {getCourierApprovalLabel(courier)}
          </Badge>
        </div>
        {ativa && (
          <div className="shrink-0">
            <SOSButton orderId={ativa.order_id} deliveryId={ativa.id} />
          </div>
        )}
      </div>

      {ativa && (
        <section className="rounded-2xl border-2 border-primary bg-card p-4 shadow-brand">
          <div className="flex items-center justify-between gap-3">
            <Badge className="bg-primary text-primary-foreground shrink-0">Corrida ativa</Badge>
            <span className="font-bold text-primary shrink-0">
              {fmt(ativa.valor_entrega_cents)}
            </span>
          </div>

          <div className="mt-4">
            <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
              {STAGES.map((s, i) => {
                const done = i < currentStageIdx;
                const active = i === currentStageIdx;
                return (
                  <div
                    key={s.key}
                    className={`h-2 rounded-full ${done || active ? "bg-primary" : "bg-muted"}`}
                  />
                );
              })}
            </div>
            <p className="mt-2 text-xs font-semibold text-muted-foreground">
              Etapa {Math.max(1, currentStageIdx + 1)} de {STAGES.length} · {currentStage?.label}
            </p>
          </div>

          {order && estab && (
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-border bg-background p-3">
                <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
                  <Package className="h-3.5 w-3.5 shrink-0" /> Loja
                </p>
                <p className="truncate font-semibold">{estab.nome}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {estab.endereco ?? "—"}
                  {estab.cidade ? ` · ${estab.cidade}` : ""}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {estab.telefone ? (
                    <a href={`tel:${estab.telefone}`} className="w-full">
                      <Button size="sm" variant="outline" className="w-full">
                        <Phone className="mr-1.5 h-3 w-3" />
                        Ligar
                      </Button>
                    </a>
                  ) : (
                    <Button size="sm" variant="outline" className="w-full" disabled>
                      <Phone className="mr-1.5 h-3 w-3" />
                      Ligar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => setChatOpen("store_courier")}
                  >
                    <MessageSquare className="mr-1.5 h-3 w-3" />
                    Chat loja
                  </Button>
                </div>
              </div>
              <div className="min-w-0 rounded-xl border border-border bg-background p-3">
                <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" /> Cliente
                </p>
                <p className="truncate font-semibold">{cliente?.nome ?? "Cliente"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {order.endereco_entrega?.endereco ?? "—"}
                  {order.endereco_entrega?.complemento
                    ? ` · ${order.endereco_entrega.complemento}`
                    : ""}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {cliente?.telefone ? (
                    <a href={`tel:${cliente.telefone}`} className="w-full">
                      <Button size="sm" variant="outline" className="w-full">
                        <Phone className="mr-1.5 h-3 w-3" />
                        Ligar
                      </Button>
                    </a>
                  ) : (
                    <Button size="sm" variant="outline" className="w-full" disabled>
                      <Phone className="mr-1.5 h-3 w-3" />
                      Ligar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => setChatOpen("client_courier")}
                  >
                    <MessageSquare className="mr-1.5 h-3 w-3" />
                    Chat cliente
                  </Button>
                </div>
              </div>
              {order.observacoes && (
                <div className="md:col-span-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                  <strong>Observações:</strong> {order.observacoes}
                </div>
              )}
              <OrderPaymentBadge
                channel={order.payment_channel}
                state={order.online_payment_state}
                isTest={order.is_test}
              />
              {order.forma_pagamento === "dinheiro" && (
                <div className="md:col-span-2 rounded-xl border-2 border-emerald-500/50 bg-emerald-500/10 p-3 text-sm">
                  <p className="flex items-center gap-2 font-bold text-emerald-600 dark:text-emerald-400">
                    <Banknote className="h-4 w-4 shrink-0" /> Pagamento em dinheiro
                  </p>
                  <p className="mt-1 text-xs">
                    Total a receber: <strong>{fmt(order.total_cents)}</strong>
                    {order.troco_para_cents ? (
                      <>
                        {" "}
                        · Cliente vai pagar com <strong>
                          {fmt(order.troco_para_cents)}
                        </strong> ·{" "}
                        <span className="text-emerald-600 dark:text-emerald-400">
                          Levar troco: <strong>{fmt(trocoDevolver)}</strong>
                        </span>
                      </>
                    ) : (
                      <> · Sem necessidade de troco</>
                    )}
                  </p>
                </div>
              )}
              <div className="md:col-span-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-background px-3 py-2 text-xs">
                <span className="flex min-w-0 items-center gap-2 truncate">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  Pagamento:{" "}
                  <strong className="text-foreground uppercase">{order.forma_pagamento}</strong>
                </span>
                <span className="shrink-0">
                  Total pedido:{" "}
                  <strong className="text-foreground">{fmt(order.total_cents)}</strong>
                </span>
              </div>

              {currentStage?.key === "at_customer" && (
                <div className="md:col-span-2 min-w-0 overflow-hidden rounded-2xl border-2 border-primary bg-primary/5 p-3 sm:p-4">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 rounded-full bg-primary/15 p-2 text-primary">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-primary">Código obrigatório para finalizar</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Peça ao cliente o código de 4 dígitos que aparece no pedido dele. Sem esse
                        código, a entrega não finaliza.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-bold uppercase text-muted-foreground">
                        Digite o código do cliente
                      </label>
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
                        className={`h-14 w-full text-center text-2xl font-black tracking-[0.35em] sm:text-3xl sm:tracking-[0.45em] ${codeError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      />
                      {codeError && (
                        <p
                          id="codigo-erro-inline"
                          role="alert"
                          className="mt-2 flex items-start gap-1.5 break-words text-xs font-semibold text-destructive"
                        >
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0 flex-1">{codeError}</span>
                        </p>
                      )}
                    </div>
                    <Button
                      size="lg"
                      className="w-full"
                      onClick={confirmarEntrega}
                      disabled={advancing || codeInput.length !== 4}
                    >
                      {advancing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      Finalizar entrega
                    </Button>
                  </div>

                  <div className="mt-3 min-w-0">
                    <input
                      ref={proofInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      aria-describedby="delivery-proof-help"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && pickProof(e.target.files[0])}
                    />
                    {proofPreview ? (
                      <div className="min-w-0 rounded-xl border border-border bg-background p-2">
                        <img
                          src={proofPreview}
                          alt="Prova de entrega"
                          className="max-h-52 w-full rounded-lg object-cover"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 w-full"
                          aria-describedby="delivery-proof-help"
                          onClick={() => {
                            setProofFile(null);
                            setProofPreview(null);
                          }}
                        >
                          Trocar foto da prova
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => proofInputRef.current?.click()}
                        aria-describedby="delivery-proof-help"
                      >
                        <Camera className="mr-2 h-4 w-4 shrink-0" />
                        <span className="truncate">Adicionar foto da entrega (opcional)</span>
                      </Button>
                    )}
                    <ImageUploadGuidance
                      id="delivery-proof-help"
                      profile="delivery-proof"
                      className="mt-2"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
            {currentStage && currentStage.key !== "at_customer" && (
              <Button
                size="lg"
                className="w-full"
                onClick={() => {
                  if (currentStage.key === "accepted") {
                    const addr = [estab?.endereco, estab?.cidade, "Brasil"]
                      .filter(Boolean)
                      .join(", ");
                    if (!addr) {
                      avancar(currentStage.next);
                      return;
                    }
                    setNavTarget({
                      next: currentStage.next,
                      address: addr,
                      label: `Loja: ${estab?.nome ?? ""}`,
                    });
                    setNavPickerOpen(true);
                  } else if (currentStage.key === "picked_up") {
                    const e = order?.endereco_entrega;
                    const addr = [e?.endereco, e?.bairro, "Brasil"].filter(Boolean).join(", ");
                    if (!addr) {
                      avancar(currentStage.next);
                      return;
                    }
                    setNavTarget({
                      next: currentStage.next,
                      address: addr,
                      label: `Cliente: ${cliente?.nome ?? ""}`,
                    });
                    setNavPickerOpen(true);
                  } else {
                    avancar(currentStage.next);
                  }
                }}
                disabled={advancing}
              >
                {advancing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Navigation className="mr-2 h-4 w-4" />
                )}
                {currentStage.cta}
              </Button>
            )}
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setIncidentOpen(true)}
            >
              <AlertTriangle className="mr-2 h-4 w-4" /> Reportar problema
            </Button>
          </div>
        </section>
      )}

      {!ativa && !canReceiveRides && (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
          <p className="text-sm font-bold text-foreground">Corridas bloqueadas por enquanto</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Seu cadastro ainda não foi aprovado pelo admin. Assim que a validação for concluída, as
            ofertas aparecem aqui em tempo real.
          </p>
        </section>
      )}

      {!ativa && canReceiveRides && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            Disponíveis ({disponiveis.length})
          </h2>
          <div className="space-y-3">
            {disponiveis.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
                <Bike className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Nenhuma corrida disponível no momento.
                </p>
              </div>
            )}
            {disponiveis.map((d) => {
              const m = availMeta[d.id];
              return (
                <div
                  key={d.id}
                  className="group relative overflow-hidden rounded-[2rem] border-2 border-primary/30 bg-card p-5 shadow-sm transition-all hover:shadow-xl hover:border-primary/60"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">
                        {d.entregador_id === courier?.user_id
                          ? "🎯 Chamado direto para você"
                          : m?.nome || "Corrida disponível"}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {m?.distKm != null ? (
                          <span>
                            <b className="text-foreground">
                              {m.distKm.toString().replace(".", ",")} km
                            </b>{" "}
                            até a coleta
                          </span>
                        ) : (
                          <span>Aceite antes que outro entregador</span>
                        )}
                      </div>
                    </div>
                    <span className="font-bold text-primary shrink-0">
                      {fmt(d.valor_entrega_cents)}
                    </span>
                  </div>
                  <div className="mt-4">
                    <Button
                      className="w-full h-12 rounded-xl text-base font-bold shadow-lg shadow-primary/20 transition-transform active:scale-95"
                      onClick={() => aceitar(d)}
                    >
                      Aceitar corrida
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Chat drawer */}
      <Sheet open={chatOpen !== null} onOpenChange={(o) => !o && setChatOpen(null)}>
        <SheetContent side="right" className="flex h-dvh w-full min-w-0 flex-col p-0 sm:max-w-md">
          <SheetHeader className="shrink-0 border-b border-border p-4 pr-12">
            <SheetTitle>
              {chatOpen === "client_courier" ? "Chat com o cliente" : "Chat com a loja"}
            </SheetTitle>
          </SheetHeader>
          {chatOpen && ativa && order && (
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden p-3">
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
            <DialogDescription>
              Gera um protocolo para o suporte PedeTrem analisar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              {INCIDENT_TYPES.map((t) => (
                <button
                  key={t.k}
                  type="button"
                  onClick={() => setIncidentType(t.k)}
                  className={`rounded-xl border-2 p-3 font-semibold transition ${
                    incidentType === t.k
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <textarea
              className="w-full rounded-xl border border-border bg-background p-3 text-sm"
              rows={3}
              placeholder="Descreva o que aconteceu (opcional)"
              value={incidentText}
              onChange={(e) => setIncidentText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIncidentOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarIncidente} disabled={savingIncident}>
              {savingIncident ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <AlertTriangle className="mr-2 h-4 w-4" />
              )}
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
            <div className="h-20 w-20 rounded-full bg-green-500/15 flex items-center justify-center text-4xl">
              ✅
            </div>
            {deliveredInfo?.clienteNome && (
              <p className="text-sm text-muted-foreground">
                Cliente: <b>{deliveredInfo.clienteNome}</b>
              </p>
            )}
            {deliveredInfo && deliveredInfo.valorCents > 0 && (
              <p className="text-lg font-black text-primary">
                + R$ {(deliveredInfo.valorCents / 100).toFixed(2).replace(".", ",")}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Você já está online para novas corridas.
            </p>
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

      <Dialog
        open={navPickerOpen}
        onOpenChange={(o) => {
          if (!o) {
            setNavPickerOpen(false);
            setNavTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Abrir navegação</DialogTitle>
            <DialogDescription>
              Escolha o app de GPS para traçar a rota até {navTarget?.label || "o destino"}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            {navTarget &&
              (() => {
                const q = encodeURIComponent(navTarget.address);
                const isIOS =
                  typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
                const openAndAdvance = (url: string) => {
                  window.open(url, "_blank");
                  const next = navTarget.next;
                  setNavPickerOpen(false);
                  setNavTarget(null);
                  setTimeout(() => avancar(next), 300);
                };
                return (
                  <>
                    <Button
                      size="lg"
                      className="w-full justify-start"
                      onClick={() =>
                        openAndAdvance(
                          `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`,
                        )
                      }
                    >
                      <Navigation className="mr-2 h-4 w-4" /> Google Maps
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => openAndAdvance(`https://waze.com/ul?q=${q}&navigate=yes`)}
                    >
                      <Navigation className="mr-2 h-4 w-4" /> Waze
                    </Button>
                    {isIOS && (
                      <Button
                        size="lg"
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() =>
                          openAndAdvance(`https://maps.apple.com/?daddr=${q}&dirflg=d`)
                        }
                      >
                        <Navigation className="mr-2 h-4 w-4" /> Apple Maps
                      </Button>
                    )}
                    <p className="mt-1 text-center text-xs text-muted-foreground truncate">
                      {navTarget.address}
                    </p>
                  </>
                );
              })()}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setNavPickerOpen(false);
                setNavTarget(null);
              }}
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
