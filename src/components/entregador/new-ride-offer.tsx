import { OrderPaymentBadge } from "@/components/order-payment-badge";
import { bindResumeRefresh } from "@/lib/resume-refresh";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  MapPin,
  Package,
  Navigation,
  Banknote,
  CreditCard,
  Timer,
  X,
  Bike,
  Route as RouteIcon,
  User,
  Phone,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { transitionCourierDelivery } from "@/lib/courier-delivery-transition";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { canCourierAccessRides } from "@/lib/courier-approval";
import OpenStreetMap, { type MapMarker } from "@/components/open-street-map";
import { deliveryPoint, haversineKm, navigationUrl, validMapPoint } from "@/lib/map-utils";
import { ensureRingtoneUnlocked, startRideRingtone, stopRideRingtone } from "@/lib/ride-ringtone";
import { watchDeviceLocation } from "@/lib/device-preferences";
import type { Courier } from "@/hooks/use-courier";

export type Offer = {
  is_test: boolean;
  deliveryId: string;
  orderId: string;
  valorCents: number;
  totalPedidoCents: number;
  formaPagamento: string;
  paymentChannel?: string | null;
  paymentState?: string | null;
  pickup: { lat: number | null; lng: number | null; nome: string; endereco: string | null };
  dropoff: {
    lat: number | null;
    lng: number | null;
    endereco: string;
    bairro: string | null;
    complemento: string | null;
    referencia: string | null;
  };
  cliente: { nome: string; telefone: string | null };
  distanciaColeta: number | null;
  distanciaEntrega: number | null;
  observacoes: string | null;
};

type OrderAddress = {
  endereco?: string | null;
  logradouro?: string | null;
  rua?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  estado?: string | null;
  cep?: string | null;
  complemento?: string | null;
  referencia?: string | null;
  ponto_referencia?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
};

type OfferOrder = {
  is_test?: boolean;
  id: string;
  cliente_id: string;
  establishment_id: string;
  total_cents: number | null;
  endereco_entrega: OrderAddress | null;
  forma_pagamento: string | null;
  payment_channel?: string | null;
  online_payment_state?: string | null;
  observacoes: string | null;
};

type OfferEstablishment = {
  id: string;
  nome: string;
  endereco: string | null;
  lat: number | string | null;
  lng: number | string | null;
  cidade: string | null;
  estado: string | null;
};

const MAX_DELIVERY_DISTANCE_KM = 150;

function cleanPart(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function fmtEndereco(
  e: OrderAddress | null | undefined,
  fallback?: { cidade?: string | null; estado?: string | null },
): string {
  if (!e) return "Endereço do cliente";
  const rua = cleanPart(e.endereco || e.logradouro || e.rua);
  const numero = cleanPart(e.numero);
  const bairro = cleanPart(e.bairro);
  const cidade = cleanPart(e.cidade || fallback?.cidade);
  const estado = cleanPart(e.uf || e.estado || fallback?.estado);
  const cep = cleanPart(e.cep);
  const parts = [rua, numero, bairro, cidade, estado, cep, "Brasil"].filter(Boolean);
  return parts.length > 1 ? parts.join(", ") : "Endereço do cliente";
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return Math.round(haversineKm(a, b) * 10) / 10;
}

function fmtBrl(cents: number) {
  return ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtKm(km: number | null) {
  if (km == null) return "—";
  return `${km.toFixed(1).replace(".", ",")} km`;
}
function estMin(km: number | null) {
  if (km == null) return null;
  // moto ~28 km/h em ambiente urbano
  return Math.max(1, Math.round((km / 28) * 60));
}

export function NewRideOffer({ courier, enabled }: { courier: Courier | null; enabled: boolean }) {
  const navigate = useNavigate();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  // Captura localização do entregador em tempo real
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.geolocation) return;
    const stopWatching = watchDeviceLocation(
      (p) => setMyPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return stopWatching;
  }, [enabled]);

  // Busca corrida disponível
  useEffect(() => {
    if (!enabled || !courier || courier.status !== "online" || !canCourierAccessRides(courier)) {
      stopRideRingtone();
      setOffer(null);
      return;
    }
    let cancelled = false;
    let sequence = 0;

    async function evaluate() {
      if (cancelled || !courier) return;
      const request = ++sequence;
      const isCurrent = () => !cancelled && request === sequence;
      const commitOffer = (value: Offer | null) => {
        if (isCurrent()) setOffer(value);
      };

      // Não mostra se já tem corrida ativa
      const { data: ativa } = await supabase
        .from("deliveries")
        .select("id,is_test")
        .eq("entregador_id", courier.user_id)
        .in("status", [
          "accepted",
          "to_store",
          "at_store",
          "picked_up",
          "to_customer",
          "at_customer",
        ])
        .limit(1)
        .maybeSingle();
      if (ativa) {
        if (isCurrent()) stopRideRingtone();
        commitOffer(null);
        return;
      }

      const { data: disp } = await supabase
        .from("deliveries")
        .select("id,order_id,valor_entrega_cents,is_test")
        .eq("status", "broadcasting")
        .or(`entregador_id.is.null,entregador_id.eq.${courier.user_id}`)
        .order("created_at", { ascending: false })
        .limit(5);

      const candidato = (disp ?? []).find((d) => !dismissedIds.has(d.id));
      if (!candidato) {
        if (isCurrent()) stopRideRingtone();
        commitOffer(null);
        return;
      }

      const { data: order } = await supabase
        .from("orders")
        .select(
          "id, cliente_id, establishment_id, total_cents, endereco_entrega, forma_pagamento, observacoes,is_test,payment_channel,online_payment_state",
        )
        .eq("id", candidato.order_id)
        .maybeSingle();
      if (!order) {
        commitOffer(null);
        return;
      }
      const typedOrder = order as OfferOrder;

      const { data: estab } = await supabase
        .from("establishments")
        .select("id, nome, endereco, lat, lng, cidade, estado")
        .eq("id", typedOrder.establishment_id)
        .maybeSingle();
      if (!estab) {
        commitOffer(null);
        return;
      }
      const typedEstab = estab as OfferEstablishment;
      const pickupPoint = deliveryPoint(typedEstab);

      const { data: cli } = await supabase
        .from("profiles")
        .select("nome, telefone")
        .eq("id", typedOrder.cliente_id)
        .maybeSingle();

      const endereco = typedOrder.endereco_entrega ?? {};
      const pickup = {
        lat: pickupPoint?.lat ?? null,
        lng: pickupPoint?.lng ?? null,
        nome: typedEstab.nome,
        endereco:
          [typedEstab.endereco, typedEstab.cidade, typedEstab.estado]
            .map(cleanPart)
            .filter(Boolean)
            .join(", ") || null,
      };
      const enderecoFmt = fmtEndereco(endereco, {
        cidade: typedEstab.cidade,
        estado: typedEstab.estado,
      });

      const storedPoint = deliveryPoint(endereco);
      const dropoff = {
        lat: storedPoint?.lat ?? null,
        lng: storedPoint?.lng ?? null,
        endereco: enderecoFmt,
        bairro: endereco.bairro ?? null,
        complemento: endereco.complemento ?? null,
        referencia: endereco.referencia ?? endereco.ponto_referencia ?? null,
      };

      const distanciaColeta = myPos && pickupPoint ? distanceKm(myPos, pickupPoint) : null;
      const distanciaEntrega =
        storedPoint && pickupPoint ? distanceKm(pickupPoint, storedPoint) : null;

      // Sanity: nenhuma entrega real ultrapassa o limite entre loja e cliente.
      if (distanciaEntrega != null && distanciaEntrega > MAX_DELIVERY_DISTANCE_KM) {
        console.warn("[NewRideOffer] Distância entrega irreal, provavelmente geocode incorreto", {
          estab: typedEstab.id,
          distanciaEntrega,
        });
        commitOffer(null);
        return;
      }

      if (cancelled) return;
      commitOffer({
        deliveryId: candidato.id,
        orderId: typedOrder.id,
        valorCents: candidato.valor_entrega_cents ?? 0,
        totalPedidoCents: typedOrder.total_cents ?? 0,
        formaPagamento: typedOrder.forma_pagamento ?? "-",
        paymentChannel: typedOrder.payment_channel,
        paymentState: typedOrder.online_payment_state,
        pickup,
        dropoff,
        cliente: { nome: cli?.nome || "Cliente", telefone: cli?.telefone ?? null },
        distanciaColeta,
        distanciaEntrega,
        is_test: typedOrder.is_test === true,
        observacoes: typedOrder.observacoes ?? null,
      });
    }

    evaluate();
    // Debounce para agrupar rajadas de eventos realtime
    let debounceT: ReturnType<typeof setTimeout> | null = null;
    const scheduleEvaluate = (payload: {
      eventType: string;
      old: Record<string, unknown>;
      new: Record<string, unknown>;
    }) => {
      // Se uma entrega que estamos vendo foi aceita ou cancelada, limpa a oferta imediatamente
      if (payload.eventType === "UPDATE" || payload.eventType === "DELETE") {
        const oldId = payload.old?.id || payload.new?.id;
        if (oldId && (payload.new?.status !== "broadcasting" || payload.eventType === "DELETE")) {
          setOffer((prev) => (prev?.deliveryId === oldId ? null : prev));
        }
      }

      if (debounceT) clearTimeout(debounceT);
      debounceT = setTimeout(() => {
        debounceT = null;
        evaluate();
      }, 300);
    };

    // Filtra por broadcasting para não receber updates irrelevantes do sistema todo
    const chBroadcast = supabase
      .channel("courier-offer-bcast-" + courier.user_id)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries" },
        scheduleEvaluate,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void evaluate();
      });

    // Losing couriers may no longer receive the assigned row under RLS.
    // Reconcile availability promptly even when that UPDATE is not visible.
    const stopResume = bindResumeRefresh(evaluate);
    const t = setInterval(evaluate, 4000);
    return () => {
      cancelled = true;
      sequence++;
      stopResume();
      if (debounceT) clearTimeout(debounceT);
      supabase.removeChannel(chBroadcast);
      clearInterval(t);
    };
    // The polling lifecycle intentionally ignores nested courier/myPos object churn to avoid
    // recreating subscriptions on every live location tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    courier?.user_id,
    courier?.status,
    courier?.aprovacao,
    courier?.kyc_status,
    dismissedIds,
  ]);

  const offerMarkers = useMemo<MapMarker[]>(() => {
    if (!offer) return [];
    const points: MapMarker[] = [];
    if (validMapPoint(offer.pickup))
      points.push({
        id: "pickup",
        lat: offer.pickup.lat,
        lng: offer.pickup.lng,
        title: "A · " + offer.pickup.nome,
        color: "#10B981",
      });
    if (validMapPoint(offer.dropoff))
      points.push({
        id: "dropoff",
        lat: offer.dropoff.lat,
        lng: offer.dropoff.lng,
        title: "B · Entrega",
        color: "#EF4444",
      });
    return points;
  }, [offer]);

  // Toque contínuo enquanto a oferta estiver na tela (para ao aceitar/recusar/ser pega)
  useEffect(() => {
    ensureRingtoneUnlocked();
    if (offer) {
      (window as unknown as { __wifomeRideOfferOpen?: boolean }).__wifomeRideOfferOpen = true;
      startRideRingtone();
    } else {
      (window as unknown as { __wifomeRideOfferOpen?: boolean }).__wifomeRideOfferOpen = false;
      stopRideRingtone();
    }
    return () => {
      (window as unknown as { __wifomeRideOfferOpen?: boolean }).__wifomeRideOfferOpen = false;
      stopRideRingtone();
    };
    // The ringtone lifecycle is keyed by the current offer identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?.deliveryId]);

  async function aceitar() {
    if (!offer || !courier || accepting) return;
    if (!canCourierAccessRides(courier)) {
      stopRideRingtone();
      setOffer(null);
      return toast.error("Seu cadastro ainda nao foi aprovado para receber corridas.");
    }
    stopRideRingtone();
    setAccepting(true);
    try {
      await transitionCourierDelivery(offer.deliveryId, "accepted");
    } catch {
      toast.error("Corrida indisponível");
      setOffer(null);
      return;
    } finally {
      setAccepting(false);
    }
    toast.success("Corrida aceita! Boa entrega 🛵");
    setOffer(null);
    navigate({ to: "/entregador/corridas" });
  }

  function recusar() {
    if (!offer) return;
    stopRideRingtone();
    setDismissedIds((s) => new Set(s).add(offer.deliveryId));
    setOffer(null);
  }

  // Distância e ETA ao vivo — recomputa a cada atualização de posição
  const distanciaColetaLive = useMemo(() => {
    if (!offer) return null;
    if (!myPos || !validMapPoint(offer.pickup)) return offer.distanciaColeta;
    return distanceKm(myPos, offer.pickup);
    // The memo is keyed by stable offer identity to avoid recomputing on unrelated object changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPos, offer?.deliveryId, offer?.distanciaColeta]);

  const totalKm =
    offer?.distanciaEntrega != null && distanciaColetaLive != null
      ? distanciaColetaLive + offer.distanciaEntrega
      : null;
  const eta = estMin(distanciaColetaLive);

  return (
    <Dialog open={!!offer} onOpenChange={(o) => !o && !accepting && recusar()}>
      <DialogContent
        className="theme-entregador flex w-[calc(100%-2rem)] min-w-0 max-w-[26rem] max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-3xl border border-white/10 p-0 shadow-2xl sm:w-[calc(100%-2rem)] sm:p-0"
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <RideOfferCard
          offer={offer}
          myPos={myPos}
          offerMarkers={offerMarkers}
          distanciaColetaLive={distanciaColetaLive}
          totalKm={totalKm}
          eta={eta}
          accepting={accepting}
          canAccept={canCourierAccessRides(courier)}
          aceitar={aceitar}
          recusar={recusar}
        />
      </DialogContent>
    </Dialog>
  );
}

export function RideOfferCard({
  offer,
  myPos,
  offerMarkers,
  distanciaColetaLive,
  totalKm,
  eta,
  accepting,
  canAccept,
  aceitar,
  recusar,
}: {
  offer: Offer | null;
  myPos: { lat: number; lng: number } | null;
  offerMarkers: MapMarker[];
  distanciaColetaLive: number | null;
  totalKm: number | null;
  eta: number | null;
  accepting: boolean;
  canAccept: boolean;
  aceitar: () => void;
  recusar: () => void;
}) {
  return (
    <>
      {/* Cabeçalho compacto */}
      <div className="relative shrink-0 bg-emerald-950 px-5 py-4 text-primary-foreground">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <div className="shrink-0 rounded-2xl bg-emerald-400/20 p-2.5">
              <Bike className="h-5 w-5 text-emerald-300" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-sm font-bold tracking-tight text-white">
                {offer?.is_test ? "Corrida de teste" : "Nova corrida"}
              </DialogTitle>
              <DialogDescription className="mt-1 flex items-start gap-1 text-xs font-semibold text-emerald-100/85">
                <Timer className="mt-0.5 h-3 w-3 shrink-0" />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {offer?.is_test
                    ? "Simulação sem entrega ou pagamento real"
                    : "Disponível para os entregadores da região"}
                </span>
              </DialogDescription>
            </div>
          </div>
          <button
            onClick={recusar}
            className="shrink-0 rounded-full bg-white/15 p-1.5 transition hover:bg-white/25"
            aria-label="Recusar"
            disabled={accepting}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        {/* Mapa */}
        <div className="h-[clamp(7rem,20dvh,11rem)] w-full min-w-0 overflow-hidden bg-muted [&_.leaflet-bottom]:max-w-full [&_.leaflet-control-attribution]:whitespace-normal">
          {offer && (
            <OpenStreetMap key={offer.deliveryId} markers={offerMarkers} userLocation={myPos} />
          )}
        </div>
        <p className="px-5 pt-2 text-[10px] leading-relaxed text-muted-foreground">
          Distâncias aproximadas em linha reta. Abra o GPS para navegar pelas ruas.
        </p>

        <div className="mx-4 mt-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
          <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Você recebe
              </p>
              <p className="mt-1 break-words text-3xl font-black tracking-tight text-emerald-600">
                {fmtBrl(offer?.valorCents ?? 0)}
              </p>
            </div>
            <div className="flex shrink-0 gap-4 text-right">
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                  Distância total
                </p>
                <p className="mt-1 text-sm font-bold">{fmtKm(totalKm)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                  Até a coleta
                </p>
                <p className="mt-1 text-sm font-bold">{eta ? `${eta} min` : "—"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Rota */}
        <div className="space-y-4 p-4">
          <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card p-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-xs font-black text-emerald-700">
              A
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                <Package className="h-3 w-3 shrink-0" />
                Coleta{" "}
                {distanciaColetaLive != null && (
                  <span className="text-foreground">· {fmtKm(distanciaColetaLive)} de você</span>
                )}
              </p>
              <p className="text-sm font-bold [overflow-wrap:anywhere]">{offer?.pickup.nome}</p>
              <p className="text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                {offer?.pickup.endereco ?? "—"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card p-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-xs font-black text-orange-600">
              B
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                Entrega{" "}
                <span className="text-foreground">· {fmtKm(offer?.distanciaEntrega ?? null)}</span>
              </p>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="flex min-w-0 flex-1 items-start gap-1.5 text-sm font-bold">
                  <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{offer?.cliente.nome}</span>
                </p>
                {offer?.cliente.telefone && (
                  <a
                    href={`tel:${offer.cliente.telefone}`}
                    aria-label="Ligar para o cliente"
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-700"
                  >
                    <Phone className="h-3 w-3" />
                    Ligar
                  </a>
                )}
              </div>
              <p className="text-xs leading-relaxed [overflow-wrap:anywhere]">
                {offer?.dropoff.endereco}
              </p>
              {(offer?.dropoff.bairro || offer?.dropoff.complemento) && (
                <p className="text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                  {[offer.dropoff.bairro, offer.dropoff.complemento].filter(Boolean).join(" · ")}
                </p>
              )}
              {offer?.dropoff.referencia && (
                <p className="text-xs italic text-muted-foreground [overflow-wrap:anywhere]">
                  Ref.: {offer.dropoff.referencia}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs">
            <span className="flex min-w-0 flex-wrap items-center gap-1.5 font-semibold">
              <OrderPaymentBadge
                channel={offer?.paymentChannel}
                state={offer?.paymentState}
                isTest={offer?.is_test}
              />
              {offer?.formaPagamento === "dinheiro" ? (
                <>
                  <Banknote className="h-3.5 w-3.5 text-emerald-600" /> Dinheiro
                </>
              ) : (
                <>
                  <CreditCard className="h-3.5 w-3.5 text-primary" /> {offer?.formaPagamento}
                </>
              )}
            </span>
            <span className="text-muted-foreground">
              Pedido:{" "}
              <strong className="text-foreground">{fmtBrl(offer?.totalPedidoCents ?? 0)}</strong>
            </span>
          </div>

          {offer?.observacoes && (
            <div className="[overflow-wrap:anywhere] rounded-xl border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
              <strong>Obs.:</strong> {offer.observacoes}
            </div>
          )}
        </div>

        {offer && (
          <div className="grid grid-cols-2 gap-2 px-4 pb-4">
            <Button variant="outline" asChild className="min-w-0 px-2 text-xs sm:text-sm">
              <a
                href={navigationUrl(
                  validMapPoint(offer.pickup)
                    ? `${offer.pickup.lat},${offer.pickup.lng}`
                    : offer.pickup.endereco || offer.pickup.nome,
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Navigation className="h-4 w-4" /> GPS coleta
              </a>
            </Button>
            <Button variant="outline" asChild className="min-w-0 px-2 text-xs sm:text-sm">
              <a
                href={navigationUrl(offer.dropoff.endereco)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Navigation className="h-4 w-4" /> GPS entrega
              </a>
            </Button>
          </div>
        )}
      </div>
      {/* Ações sempre visíveis; apenas o conteúdo acima rola verticalmente. */}
      <div className="z-10 grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] gap-2 border-t border-border bg-background p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button
          variant="outline"
          size="lg"
          className="h-12 min-w-0 rounded-xl px-2 font-semibold"
          onClick={recusar}
          disabled={accepting}
        >
          Recusar
        </Button>
        <Button
          size="lg"
          onClick={aceitar}
          disabled={accepting || !canAccept}
          className="h-12 min-w-0 gap-2 rounded-xl bg-emerald-600 px-2 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 sm:text-base"
        >
          {accepting ? (
            <>
              <RouteIcon className="h-4 w-4 animate-pulse" /> Aceitando...
            </>
          ) : (
            <>
              <Navigation className="h-4 w-4" /> Aceitar corrida
            </>
          )}
        </Button>
      </div>
    </>
  );
}
