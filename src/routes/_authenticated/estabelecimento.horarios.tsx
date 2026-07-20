import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab } from "@/hooks/use-my-estab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/estabelecimento/horarios")({
  component: HorariosPage,
});

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

type Hour = { id?: string; dia_semana: number; abre: string; fecha: string; ativo: boolean };

function HorariosPage() {
  const { estab } = useMyEstab();
  const [hours, setHours] = useState<Hour[]>([]);

  useEffect(() => {
    if (!estab) return;
    (async () => {
      const { data } = await supabase.from("establishment_hours")
        .select("id,dia_semana,abre,fecha,ativo").eq("establishment_id", estab.id);
      const map = new Map<number, Hour>();
      (data ?? []).forEach((h) => map.set(h.dia_semana, h as Hour));
      const list: Hour[] = DIAS.map((_, i) => map.get(i) ?? { dia_semana: i, abre: "08:00", fecha: "22:00", ativo: false });
      setHours(list);
    })();
  }, [estab?.id]);

  async function salvar(h: Hour) {
    if (!estab) return;
    const payload = { establishment_id: estab.id, dia_semana: h.dia_semana, abre: h.abre, fecha: h.fecha, ativo: h.ativo };
    if (h.id) await supabase.from("establishment_hours").update(payload).eq("id", h.id);
    else {
      const { data } = await supabase.from("establishment_hours").insert(payload).select("id").single();
      if (data) h.id = data.id;
    }
    toast.success(DIAS[h.dia_semana] + " salvo");
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-black tracking-tight">Horários de funcionamento</h1>
      <div className="space-y-2">
        {hours.map((h, idx) => (
          <div key={h.dia_semana} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
            <Switch checked={h.ativo} onCheckedChange={(v) => { const n = [...hours]; n[idx] = { ...h, ativo: v }; setHours(n); }} />
            <span className="w-24 font-medium">{DIAS[h.dia_semana]}</span>
            <Input type="time" value={h.abre} className="w-32" onChange={(e) => { const n = [...hours]; n[idx] = { ...h, abre: e.target.value }; setHours(n); }} />
            <span>até</span>
            <Input type="time" value={h.fecha} className="w-32" onChange={(e) => { const n = [...hours]; n[idx] = { ...h, fecha: e.target.value }; setHours(n); }} />
            <Button size="sm" onClick={() => salvar(h)}>Salvar</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
