import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Bike } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntregadorShell } from "@/components/entregador/entregador-shell";
import { IFomeLogo } from "@/components/ifome-logo";
import { useMyCourier } from "@/hooks/use-courier";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/entregador")({
  component: EntregadorLayout,
});

function EntregadorLayout() {
  const { courier, userId, isLoading } = useMyCourier();
  const qc = useQueryClient();
  const [form, setForm] = useState({ veiculo: "moto", placa: "", cnh: "", pix: "", telefone: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!courier || typeof navigator === "undefined" || !navigator.geolocation) return;
    if (courier.status !== "online" && courier.status !== "ocupado") return;
    let lastSent = 0;
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const now = Date.now();
        if (now - lastSent < 10000) return;
        lastSent = now;
        await supabase.from("tracking_points").insert({
          courier_id: courier.user_id,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [courier]);

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
        status: "aprovado",
        aprovacao: "em_analise",
      });
      setSaving(false);
      if (error) return toast.error("Falha ao cadastrar: " + error.message);
      toast.success("Cadastro criado!");
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
              <div><Label>Veículo</Label><Input value={form.veiculo} onChange={(e) => setForm({ ...form, veiculo: e.target.value })} /></div>
              <div><Label>Placa</Label><Input value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value })} /></div>
              <div><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
              <div><Label>CNH</Label><Input value={form.cnh} onChange={(e) => setForm({ ...form, cnh: e.target.value })} /></div>
              <div><Label>Chave PIX</Label><Input value={form.pix} onChange={(e) => setForm({ ...form, pix: e.target.value })} /></div>
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
    <EntregadorShell>
      <Outlet />
    </EntregadorShell>
  );
}
