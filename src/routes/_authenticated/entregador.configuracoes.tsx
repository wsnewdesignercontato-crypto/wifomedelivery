import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/entregador/configuracoes")({
  component: Cfg,
});

function Cfg() {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState({ som: true, vibra: true, push: true, alto_volume: true });

  useEffect(() => {
    const s = localStorage.getItem("wifome_courier_prefs");
    if (s) setPrefs(JSON.parse(s));
  }, []);

  function save(next: typeof prefs) {
    setPrefs(next);
    localStorage.setItem("wifome_courier_prefs", JSON.stringify(next));
    toast.success("Preferências salvas");
  }

  async function sair() {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">Configurações</h1>
      <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <h2 className="mb-3 font-semibold">Notificações</h2>
        <div className="space-y-3">
          <Row label="Som de nova corrida" v={prefs.som} onChange={(v) => save({ ...prefs, som: v })} />
          <Row label="Vibração" v={prefs.vibra} onChange={(v) => save({ ...prefs, vibra: v })} />
          <Row label="Push" v={prefs.push} onChange={(v) => save({ ...prefs, push: v })} />
          <Row label="Volume alto para corridas" v={prefs.alto_volume} onChange={(v) => save({ ...prefs, alto_volume: v })} />
        </div>
      </section>
      <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <h2 className="mb-3 font-semibold">Conta</h2>
        <Button variant="destructive" onClick={sair}>Sair da conta</Button>
      </section>
    </div>
  );
}

function Row({ label, v, onChange }: { label: string; v: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label>{label}</Label>
      <Switch checked={v} onCheckedChange={onChange} />
    </div>
  );
}
