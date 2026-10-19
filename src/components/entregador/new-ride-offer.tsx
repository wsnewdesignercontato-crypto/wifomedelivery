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
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { canCourierAccessRides } from "@/lib/courier-approval";
import OpenStreetMap, { type MapMarker } from "@/components/open-street-map";
import { deliveryPoint, haversineKm, navigationUrl, validMapPoint } from "@/lib/map-utils";
import { ensureRingtoneUnlocked, startRideRingtone, stopRideRingtone } from "@/lib/ride-ringtone";
import { watchDeviceLocation } from "@/lib/device-preferences";
import type { Courier } from "@/hooks/use-courier";

type Offer = {
  is_test: boolean;
  deliveryId: string;
  orderId: string;
  valorCents: number;
  totalPedidoCents: number;
  formaPagamento: string;
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
          "id, cliente_id, establishment_id, total_cents, endereco_entrega, forma_pagamento, observacoes,is_test",
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
    <Dialog open={!!offer} onOpenChange={(o) => !o && recusar()}>
      <DialogContent
        className="theme-entregador max-w-md p-0 overflow-y-auto gap-0 border-2 border-primary shadow-brand"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Header estilo Uber */}
        <div className="relative bg-gradient-to-r from-primary to-orange-500 px-4 py-3 text-primary-foreground">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="animate-pulse rounded-full bg-white/25 p-1.5">
                <Bike className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider opacity-90">
                  {offer?.is_test ? "Corrida de teste" : "Nova corrida"}
                </p>
                <p className="text-xs font-semibold opacity-80 flex items-center gap-1">
                  <Timer className="h-3 w-3" />{" "}
                  {offer?.is_test
                    ? "Simulação sem entrega ou pagamento real"
                    : "Aceite rápido — outros entregadores estão vendo"}
                </p>
              </div>
            </div>
            <button
              onClick={recusar}
              className="rounded-full bg-white/15 p-1.5 transition hover:bg-white/25"
              aria-label="Recusar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Mapa */}
        <div className="h-52 w-full bg-muted">
          {offer && (
            <OpenStreetMap key={offer.deliveryId} markers={offerMarkers} userLocation={myPos} />
          )}
        </div>
        <p className="px-4 pt-2 text-xs text-muted-foreground">
          Distâncias aproximadas em linha reta. Abra o GPS para navegar pelas ruas.
        </p>

        {/* Valores em destaque */}
        <div className="grid grid-cols-3 divide-x divide-border border-b border-border bg-card">
          <div className="p-3 text-center">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Ganho</p>
            <p className="text-lg font-black text-primary">{fmtBrl(offer?.valorCents ?? 0)}</p>
          </div>
          <div className="p-3 text-center">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Distância</p>
            <p className="text-lg font-black">{fmtKm(totalKm)}</p>
          </div>
          <div className="p-3 text-center">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Tempo coleta</p>
            <p className="text-lg font-black">{eta ? `${eta} min` : "—"}</p>
          </div>
        </div>

        {/* Rota */}
        <div className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex flex-col items-center">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-black text-white">
                A
              </div>
              <div className="my-1 h-8 w-0.5 bg-border" />
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white">
                B
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-muted-foreground">
                  <Package className="h-3 w-3" /> Coleta{" "}
                  {distanciaColetaLive != null && (
                    <span className="text-foreground">· {fmtKm(distanciaColetaLive)} de você</span>
                  )}
                </p>
                <p className="truncate text-sm font-bold">{offer?.pickup.nome}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {offer?.pickup.endereco ?? "—"}
                </p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-muted-foreground">
                  <MapPin className="h-3 w-3" /> Entrega
                  <span className="text-foreground">
                    · {fmtKm(offer?.distanciaEntrega ?? null)}
                  </span>
                </p>
                <p className="flex items-center gap-1.5 text-sm font-bold">
                  <User className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate">{offer?.cliente.nome}</span>
                  {offer?.cliente.telefone && (
                    <a
                      href={`tel:${offer.cliente.telefone}`}
                      className="ml-auto flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-600"
                    >
                      <Phone className="h-3 w-3" /> {offer.cliente.telefone}
                    </a>
                  )}
                </p>
                <p className="text-sm font-semibold">{offer?.dropoff.endereco}</p>
                {offer?.dropoff.bairro && (
                  <p className="truncate text-xs text-muted-foreground">
                    {offer.dropoff.bairro}
                    {offer.dropoff.complemento ? ` · ${offer.dropoff.complemento}` : ""}
                  </p>
                )}
                {offer?.dropoff.referencia && (
                  <p className="mt-1 truncate text-xs italic text-muted-foreground">
                    Ref.: {offer.dropoff.referencia}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5 font-semibold">
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
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
              <strong>Obs.:</strong> {offer.observacoes}
            </div>
          )}
        </div>

        {offer && (
          <div className="grid grid-cols-2 gap-2 px-3 pb-3">
            <Button variant="outline" asChild>
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
            <Button variant="outline" asChild>
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

        {/* Ações */}
        <div className="sticky bottom-0 z-10 grid grid-cols-[auto_1fr] gap-2 border-t border-border bg-card p-3">
          <Button variant="outline" size="lg" onClick={recusar} disabled={accepting}>
            Recusar
          </Button>
          <Button
            size="lg"
            onClick={aceitar}
            disabled={accepting || !canCourierAccessRides(courier)}
            className="text-base font-black shadow-brand"
          >
            {accepting ? (
              <>
                <RouteIcon className="mr-2 h-5 w-5 animate-pulse" /> Aceitando...
              </>
            ) : (
              <>
                <Navigation className="mr-2 h-5 w-5" /> Aceitar corrida
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
