import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Bike } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntregadorShell } from "@/components/entregador/entregador-shell";
import { IFomeLogo } from "@/components/ifome-logo";
import { OnboardingGate } from "@/components/onboarding-gate";
import { useMyCourier } from "@/hooks/use-courier";
import { useQueryClient } from "@tanstack/react-query";
import { freshDevicePoint } from "@/lib/courier-location";
import { getCurrentDevicePosition, watchDeviceLocation } from "@/lib/device-preferences";

export const Route = createFileRoute("/_authenticated/entregador")({
  head: () => ({
    meta: [
      { title: "Entregador | PedeTrem" },
      { name: "description", content: "PedeTrem: entregador." },
      { property: "og:title", content: "Entregador | PedeTrem" },
      { property: "og:description", content: "PedeTrem: entregador." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EntregadorLayout,
});

function EntregadorLayout() {
  const location = useLocation();
  if (location.pathname.replace(/\/$/, "") === "/entregador/entrar") return <Outlet />;
  return <EntregadorWorkspace />;
}

function EntregadorWorkspace() {
  const { courier, userId, isLoading } = useMyCourier();
  const qc = useQueryClient();
  const [form, setForm] = useState({ veiculo: "moto", placa: "", cnh: "", pix: "", telefone: "" });
  const [saving, setSaving] = useState(false);

  const [gpsError, setGpsError] = useState<string | null>(null);
  const trackingUserId = courier?.user_id;
  const trackingStatus = courier?.status;
  useEffect(() => {
    if (!trackingUserId || typeof navigator === "undefined" || !navigator.geolocation) return;
    if (trackingStatus !== "online" && trackingStatus !== "ocupado") return;
    let active = true;
    let sending = false;
    let lastSent = 0;
    const send: PositionCallback = async (position) => {
      if (!active || sending || Date.now() - lastSent < 5000) return;
      const point = freshDevicePoint(position);
      if (!point) return;
      sending = true;
      try {
        const results = await Promise.all([
          supabase.from("tracking_points").insert({ courier_id: trackingUserId, ...point }),
          supabase
            .from("courier_profiles")
            .update({
              lat: point.lat,
              lng: point.lng,
              last_seen: new Date(position.timestamp).toISOString(),
            })
            .eq("user_id", trackingUserId)
            .select("user_id")
            .single(),
        ]);
        if (results.some((result) => result.error)) throw new Error("write failed");
        lastSent = Date.now();
        if (active) setGpsError(null);
      } catch {
        if (active)
          setGpsError(
            "Não foi possível enviar sua localização. Verifique sua conexão; tentaremos novamente.",
          );
      } finally {
        sending = false;
      }
    };
    const error = () => {
      if (active)
        setGpsError(
          "Ative a localização do aplicativo e permita o GPS para aparecer no mapa e acompanhar suas entregas.",
        );
    };
    const options = { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 };
    const stopWatching = watchDeviceLocation(send, error, options);
    const refresh = () => {
      if (document.visibilityState === "visible") getCurrentDevicePosition(send, error, options);
    };
    const timer = setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      active = false;
      stopWatching();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [trackingUserId, trackingStatus]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!courier) {
    async function salvar() {
      setSaving(true);
      const { error } = await supabase.from("courier_profiles").insert({
        user_id: userId,
        veiculo: form.veiculo,
        placa: form.placa || null,
        cnh: form.cnh || null,
        pix_key: form.pix || null,
        telefone: form.telefone || null,
        status: "pendente",
        aprovacao: "em_analise",
        kyc_status: "pending",
      });
      setSaving(false);
      if (error) return toast.error("Falha ao cadastrar: " + error.message);
      toast.success("Cadastro enviado para analise!");
      qc.invalidateQueries({ queryKey: ["courier", userId] });
    }

    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <IFomeLogo size="sm" />
          </div>
        </header>
        <main className="mx-auto max-w-md px-4 py-10">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
            <div className="mb-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-brand text-primary-foreground shadow-brand">
                <Bike className="h-7 w-7" />
              </div>
              <h1 className="mt-4 text-2xl font-black tracking-tight">Cadastro de entregador</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Após criar seu cadastro, envie documentos e cadastre seu veículo no seu painel.
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Veículo</Label>
                <Input
                  value={form.veiculo}
                  onChange={(e) => setForm({ ...form, veiculo: e.target.value })}
                />
              </div>
              <div>
                <Label>Placa</Label>
                <Input
                  value={form.placa}
                  onChange={(e) => setForm({ ...form, placa: e.target.value })}
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                />
              </div>
              <div>
                <Label>CNH</Label>
                <Input
                  value={form.cnh}
                  onChange={(e) => setForm({ ...form, cnh: e.target.value })}
                />
              </div>
              <div>
                <Label>Chave PIX</Label>
                <Input
                  value={form.pix}
                  onChange={(e) => setForm({ ...form, pix: e.target.value })}
                />
              </div>
              <Button className="w-full" size="lg" onClick={salvar} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Finalizar cadastro inicial
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <OnboardingGate role="entregador" userId={userId}>
      <EntregadorShell>
        {gpsError && (trackingStatus === "online" || trackingStatus === "ocupado") && (
          <div
            role="status"
            className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {gpsError}
          </div>
        )}
        <Outlet />
      </EntregadorShell>
    </OnboardingGate>
  );
}
