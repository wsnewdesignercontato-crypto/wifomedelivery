import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { MapPin, Package, Navigation, Banknote, CreditCard, Timer, X, Bike, Route as RouteIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { loadGoogleMaps, haversineKm } from "@/lib/google-maps-loader";
import type { Courier } from "@/hooks/use-courier";

type Offer = {
  deliveryId: string;
  orderId: string;
  valorCents: number;
  totalPedidoCents: number;
  formaPagamento: string;
  pickup: { lat: number; lng: number; nome: string; endereco: string | null };
  dropoff: { lat: number; lng: number; endereco: string; bairro: string | null };
  distanciaColeta: number | null; // km entregador → loja
  distanciaEntrega: number; // km loja → cliente
  observacoes: string | null;
};

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
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapObjRef = useRef<google.maps.Map | null>(null);
  const myMarkerRef = useRef<google.maps.Marker | null>(null);
  const routeLineRef = useRef<google.maps.Polyline | null>(null);

  // Captura localização do entregador em tempo real
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setMyPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  // Busca corrida disponível
  useEffect(() => {
    if (!enabled || !courier) return;
    if (courier.status !== "online") return;
    if (courier.aprovacao && courier.aprovacao !== "approved" && courier.aprovacao !== "aprovado") {
      // aceitar tanto 'approved' quanto 'aprovado' se aplicável
    }

    let cancelled = false;

    async function evaluate() {
      if (cancelled || !courier) return;

      // Não mostra se já tem corrida ativa
      const { data: ativa } = await supabase
        .from("deliveries")
        .select("id")
        .eq("entregador_id", courier.user_id)
        .not("status", "in", "(delivered,cancelled)")
        .limit(1)
        .maybeSingle();
      if (ativa) { setOffer(null); return; }

      const { data: disp } = await supabase
        .from("deliveries")
        .select("id,order_id,valor_entrega_cents")
        .eq("status", "broadcasting")
        .or(`entregador_id.is.null,entregador_id.eq.${courier.user_id}`)
        .order("created_at", { ascending: false })
        .limit(5);

      const candidato = (disp ?? []).find((d) => !dismissedIds.has(d.id));
      if (!candidato) { setOffer(null); return; }

      const { data: order } = await supabase
        .from("orders")
        .select("id, establishment_id, total_cents, endereco_entrega, forma_pagamento, observacoes")
        .eq("id", candidato.order_id)
        .maybeSingle();
      if (!order) { setOffer(null); return; }

      const { data: estab } = await supabase
        .from("establishments")
        .select("id, nome, endereco, lat, lng")
        .eq("id", order.establishment_id)
        .maybeSingle();
      if (!estab || estab.lat == null || estab.lng == null) { setOffer(null); return; }

      const endereco = (order as any).endereco_entrega ?? {};
      const dropLat = Number(endereco.lat);
      const dropLng = Number(endereco.lng);
      const pickup = { lat: Number(estab.lat), lng: Number(estab.lng), nome: estab.nome, endereco: estab.endereco ?? null };
      const dropoff = {
        lat: Number.isFinite(dropLat) ? dropLat : pickup.lat + 0.005,
        lng: Number.isFinite(dropLng) ? dropLng : pickup.lng + 0.005,
        endereco: endereco.endereco ?? "Endereço do cliente",
        bairro: endereco.bairro ?? null,
      };

      const distanciaColeta = myPos ? Math.round(haversineKm(myPos, pickup) * 10) / 10 : null;
      const distanciaEntrega = Math.round(haversineKm(pickup, dropoff) * 10) / 10;

      if (cancelled) return;
      setOffer({
        deliveryId: candidato.id,
        orderId: order.id,
        valorCents: candidato.valor_entrega_cents ?? 0,
        totalPedidoCents: order.total_cents ?? 0,
        formaPagamento: (order as any).forma_pagamento ?? "—",
        pickup,
        dropoff,
        distanciaColeta,
        distanciaEntrega,
        observacoes: (order as any).observacoes ?? null,
      });
    }

    evaluate();
    const ch = supabase
      .channel("courier-offer-" + courier.user_id)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => evaluate())
      .subscribe();
    const t = setInterval(evaluate, 8000);
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
      clearInterval(t);
    };
  }, [enabled, courier?.user_id, courier?.status, dismissedIds]);

  // Renderiza mapa quando a oferta abre (uma vez por oferta)
  useEffect(() => {
    if (!offer) return;
    let cancel = false;
    loadGoogleMaps()
      .then(() => {
        if (cancel || !mapDivRef.current) return;
        const map = new google.maps.Map(mapDivRef.current, {
          center: offer.pickup,
          zoom: 13,
          disableDefaultUI: true,
          gestureHandling: "cooperative",
          clickableIcons: false,
          styles: [
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] },
          ],
        });
        mapObjRef.current = map;

        new google.maps.Marker({
          map, position: offer.pickup, title: offer.pickup.nome,
          icon: {
            path: google.maps.SymbolPath.CIRCLE, scale: 10,
            fillColor: "#10B981", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3,
          },
          label: { text: "A", color: "#fff", fontWeight: "700", fontSize: "11px" },
        });
        new google.maps.Marker({
          map, position: offer.dropoff, title: "Cliente",
          icon: {
            path: google.maps.SymbolPath.CIRCLE, scale: 10,
            fillColor: "#EF4444", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3,
          },
          label: { text: "B", color: "#fff", fontWeight: "700", fontSize: "11px" },
        });
        myMarkerRef.current = new google.maps.Marker({
          map,
          position: myPos ?? offer.pickup,
          visible: !!myPos,
          title: "Você",
          icon: {
            path: google.maps.SymbolPath.CIRCLE, scale: 7,
            fillColor: "#3B82F6", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3,
          },
        });
        routeLineRef.current = new google.maps.Polyline({
          map,
          path: myPos ? [myPos, offer.pickup, offer.dropoff] : [offer.pickup, offer.dropoff],
          strokeColor: "#FF6B00",
          strokeOpacity: 0.9,
          strokeWeight: 4,
          icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW }, offset: "100%" }],
        });

        const bounds = new google.maps.LatLngBounds();
        bounds.extend(offer.pickup);
        bounds.extend(offer.dropoff);
        if (myPos) bounds.extend(myPos);
        map.fitBounds(bounds, 60);
      })
      .catch(() => {});
    return () => {
      cancel = true;
      myMarkerRef.current = null;
      routeLineRef.current = null;
      mapObjRef.current = null;
    };
  }, [offer?.deliveryId]);

  // Atualiza posição do entregador e rota conforme ele se move
  useEffect(() => {
    if (!offer || !myPos) return;
    if (myMarkerRef.current) {
      myMarkerRef.current.setPosition(myPos);
      myMarkerRef.current.setVisible(true);
    }
    if (routeLineRef.current) {
      routeLineRef.current.setPath([myPos, offer.pickup, offer.dropoff]);
    }
  }, [myPos, offer?.deliveryId]);

  async function aceitar() {
    if (!offer || !courier || accepting) return;
    setAccepting(true);
    const { data, error } = await supabase
      .from("deliveries")
      .update({ entregador_id: courier.user_id, status: "accepted", aceito_em: new Date().toISOString() })
      .eq("id", offer.deliveryId)
      .eq("status", "broadcasting")
      .select("id")
      .maybeSingle();
    setAccepting(false);
    if (error || !data) {
      toast.error("Corrida já foi aceita por outro entregador");
      setOffer(null);
      return;
    }
    await supabase.from("orders").update({ status: "courier_assigned" }).eq("id", offer.orderId);
    await supabase.from("courier_profiles").update({ status: "ocupado" }).eq("user_id", courier.user_id);
    toast.success("Corrida aceita! Boa entrega 🛵");
    setOffer(null);
    navigate({ to: "/entregador/corridas" });
  }

  function recusar() {
    if (!offer) return;
    setDismissedIds((s) => new Set(s).add(offer.deliveryId));
    setOffer(null);
  }

  // Distância e ETA ao vivo — recomputa a cada atualização de posição
  const distanciaColetaLive = useMemo(() => {
    if (!offer) return null;
    if (!myPos) return offer.distanciaColeta;
    return Math.round(haversineKm(myPos, offer.pickup) * 10) / 10;
  }, [myPos, offer?.deliveryId, offer?.distanciaColeta]);

  const totalKm = offer ? (distanciaColetaLive ?? 0) + offer.distanciaEntrega : 0;
  const eta = estMin(distanciaColetaLive);

  return (
    <Dialog open={!!offer} onOpenChange={(o) => !o && recusar()}>
      <DialogContent
        className="max-w-md p-0 overflow-hidden gap-0 border-2 border-primary shadow-brand"
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
                <p className="text-[11px] font-bold uppercase tracking-wider opacity-90">Nova corrida</p>
                <p className="text-xs font-semibold opacity-80 flex items-center gap-1">
                  <Timer className="h-3 w-3" /> Aceite rápido — outros entregadores estão vendo
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
        <div ref={mapDivRef} className="h-52 w-full bg-muted" />

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
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-black text-white">A</div>
              <div className="my-1 h-8 w-0.5 bg-border" />
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white">B</div>
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-muted-foreground">
                  <Package className="h-3 w-3" /> Coleta {distanciaColetaLive != null && (
                    <span className="text-foreground">· {fmtKm(distanciaColetaLive)} de você</span>
                  )}
                </p>
                <p className="truncate text-sm font-bold">{offer?.pickup.nome}</p>
                <p className="truncate text-xs text-muted-foreground">{offer?.pickup.endereco ?? "—"}</p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-muted-foreground">
                  <MapPin className="h-3 w-3" /> Entrega
                  <span className="text-foreground">· {fmtKm(offer?.distanciaEntrega ?? 0)}</span>
                </p>
                <p className="truncate text-sm font-bold">{offer?.dropoff.endereco}</p>
                {offer?.dropoff.bairro && (
                  <p className="truncate text-xs text-muted-foreground">{offer.dropoff.bairro}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5 font-semibold">
              {offer?.formaPagamento === "dinheiro" ? (
                <><Banknote className="h-3.5 w-3.5 text-emerald-600" /> Dinheiro</>
              ) : (
                <><CreditCard className="h-3.5 w-3.5 text-primary" /> {offer?.formaPagamento}</>
              )}
            </span>
            <span className="text-muted-foreground">
              Pedido: <strong className="text-foreground">{fmtBrl(offer?.totalPedidoCents ?? 0)}</strong>
            </span>
          </div>

          {offer?.observacoes && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
              <strong>Obs.:</strong> {offer.observacoes}
            </div>
          )}
        </div>

        {/* Ações */}
        <div className="grid grid-cols-[auto_1fr] gap-2 border-t border-border bg-card p-3">
          <Button variant="outline" size="lg" onClick={recusar} disabled={accepting}>
            Recusar
          </Button>
          <Button
            size="lg"
            onClick={aceitar}
            disabled={accepting}
            className="text-base font-black shadow-brand"
          >
            {accepting ? (
              <><RouteIcon className="mr-2 h-5 w-5 animate-pulse" /> Aceitando...</>
            ) : (
              <><Navigation className="mr-2 h-5 w-5" /> Aceitar corrida</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
