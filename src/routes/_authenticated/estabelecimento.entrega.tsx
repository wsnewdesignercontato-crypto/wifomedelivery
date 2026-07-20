import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab, fmt } from "@/hooks/use-my-estab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/estabelecimento/entrega")({
  component: EntregaPage,
});

type Zone = { id: string; nome: string; bairro: string | null; raio_km: number | null; taxa_cents: number; tempo_min: number | null; ativo: boolean };

function EntregaPage() {
  const { estab } = useMyEstab();
  const [zones, setZones] = useState<Zone[]>([]);
  const [open, setOpen] = useState(false);

  async function reload() {
    if (!estab) return;
    const { data } = await supabase.from("establishment_delivery_zones")
      .select("id,nome,bairro,raio_km,taxa_cents,tempo_min,ativo").eq("establishment_id", estab.id);
    setZones((data ?? []) as Zone[]);
  }
  useEffect(() => { reload(); }, [estab?.id]);

  async function toggle(z: Zone) {
    await supabase.from("establishment_delivery_zones").update({ ativo: !z.ativo }).eq("id", z.id);
    reload();
  }
  async function remover(id: string) {
    if (!confirm("Excluir zona?")) return;
    await supabase.from("establishment_delivery_zones").delete().eq("id", id); reload();
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight">Áreas de entrega</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nova área</Button></DialogTrigger>
          <DialogContent><ZoneForm onSaved={() => { setOpen(false); reload(); }} /></DialogContent>
        </Dialog>
      </div>
      <div className="space-y-2">
        {zones.map((z) => (
          <div key={z.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
            <Switch checked={z.ativo} onCheckedChange={() => toggle(z)} />
            <div className="flex-1">
              <p className="font-semibold">{z.nome}</p>
              <p className="text-xs text-muted-foreground">
                {z.bairro && `${z.bairro} · `}{z.raio_km && `Raio ${z.raio_km}km · `}Taxa {fmt(z.taxa_cents)}{z.tempo_min && ` · ${z.tempo_min} min`}
              </p>
            </div>
            <Button size="icon" variant="ghost" onClick={() => remover(z.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
        {zones.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma área cadastrada.</p>}
      </div>
    </div>
  );
}

function ZoneForm({ onSaved }: { onSaved: () => void }) {
  const { estab } = useMyEstab();
  const [form, setForm] = useState({ nome: "", bairro: "", raio: "", taxa: "5.00", tempo: "40" });
  async function salvar() {
    if (!estab || !form.nome.trim()) return toast.error("Nome obrigatório");
    const { error } = await supabase.from("establishment_delivery_zones").insert({
      establishment_id: estab.id, nome: form.nome.trim(),
      bairro: form.bairro || null,
      raio_km: form.raio ? parseFloat(form.raio) : null,
      taxa_cents: Math.round(parseFloat(form.taxa || "0") * 100),
      tempo_min: form.tempo ? parseInt(form.tempo) : null,
    });
    if (error) toast.error("Falha"); else { toast.success("Área criada"); onSaved(); }
  }
  return (
    <>
      <DialogHeader><DialogTitle>Nova área</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div><Label>Nome</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
        <div><Label>Bairro (opcional)</Label><Input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Raio (km)</Label><Input value={form.raio} onChange={(e) => setForm({ ...form, raio: e.target.value })} /></div>
          <div><Label>Taxa (R$)</Label><Input value={form.taxa} onChange={(e) => setForm({ ...form, taxa: e.target.value })} /></div>
          <div><Label>Tempo (min)</Label><Input value={form.tempo} onChange={(e) => setForm({ ...form, tempo: e.target.value })} /></div>
        </div>
      </div>
      <DialogFooter><Button onClick={salvar}>Criar</Button></DialogFooter>
    </>
  );
}
