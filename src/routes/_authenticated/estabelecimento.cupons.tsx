import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab, fmt } from "@/hooks/use-my-estab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/estabelecimento/cupons")({
  component: CuponsPage,
});

type Coupon = {
  id: string; codigo: string; tipo: string;
  valor_desconto_cents: number | null; percentual_desconto: number | null;
  valor_minimo_pedido_cents: number | null;
  data_inicial: string | null; data_final: string | null;
  ativo: boolean; usos_atual: number; usos_maximo: number | null;
};

function CuponsPage() {
  const { estab } = useMyEstab();
  const [list, setList] = useState<Coupon[]>([]);
  const [open, setOpen] = useState(false);

  async function reload() {
    if (!estab) return;
    const { data } = await supabase.from("coupons")
      .select("id,codigo,tipo,valor_desconto_cents,percentual_desconto,valor_minimo_pedido_cents,data_inicial,data_final,ativo,usos_atual,usos_maximo")
      .eq("establishment_id", estab.id).order("created_at", { ascending: false });
    setList((data ?? []) as Coupon[]);
  }
  useEffect(() => { reload(); }, [estab?.id]);

  async function toggle(c: Coupon) { await supabase.from("coupons").update({ ativo: !c.ativo }).eq("id", c.id); reload(); }
  async function remover(id: string) {
    if (!confirm("Excluir cupom?")) return;
    await supabase.from("coupons").delete().eq("id", id); reload();
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight">Cupons da loja</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Novo cupom</Button></DialogTrigger>
          <DialogContent><CupomForm onSaved={() => { setOpen(false); reload(); }} /></DialogContent>
        </Dialog>
      </div>
      <div className="space-y-2">
        {list.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold">{c.codigo}</span>
                <Badge>{c.tipo === "percentual" ? `${c.percentual_desconto}%` : fmt(c.valor_desconto_cents ?? 0)}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Usos: {c.usos_atual}{c.usos_maximo ? `/${c.usos_maximo}` : ""}
                {c.valor_minimo_pedido_cents ? ` · Mín ${fmt(c.valor_minimo_pedido_cents)}` : ""}
              </p>
            </div>
            <Switch checked={c.ativo} onCheckedChange={() => toggle(c)} />
            <Button size="icon" variant="ghost" onClick={() => remover(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
        {list.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cupom criado.</p>}
      </div>
    </div>
  );
}

function CupomForm({ onSaved }: { onSaved: () => void }) {
  const { estab } = useMyEstab();
  const [f, setF] = useState({ codigo: "", tipo: "percentual", valor: "10", minimo: "", usos: "" });
  async function salvar() {
    if (!estab || !f.codigo.trim()) return toast.error("Código obrigatório");
    const payload: Record<string, unknown> = {
      establishment_id: estab.id, codigo: f.codigo.trim().toUpperCase(),
      tipo: f.tipo, ativo: true,
      valor_minimo_pedido_cents: f.minimo ? Math.round(parseFloat(f.minimo) * 100) : null,
      usos_maximo: f.usos ? parseInt(f.usos) : null,
    };
    if (f.tipo === "percentual") payload.percentual_desconto = parseFloat(f.valor);
    else payload.valor_desconto_cents = Math.round(parseFloat(f.valor) * 100);
    const { error } = await supabase.from("coupons").insert(payload as never);
    if (error) toast.error("Falha: " + error.message); else { toast.success("Cupom criado"); onSaved(); }
  }
  return (
    <>
      <DialogHeader><DialogTitle>Novo cupom</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div><Label>Código</Label><Input value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} placeholder="WELCOME10" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Tipo</Label>
            <select className="w-full rounded-md border border-input bg-background p-2 text-sm" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              <option value="percentual">Percentual (%)</option>
              <option value="valor">Valor fixo (R$)</option>
            </select>
          </div>
          <div><Label>Valor</Label><Input value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Pedido mínimo (R$)</Label><Input value={f.minimo} onChange={(e) => setF({ ...f, minimo: e.target.value })} /></div>
          <div><Label>Usos máximos</Label><Input value={f.usos} onChange={(e) => setF({ ...f, usos: e.target.value })} /></div>
        </div>
      </div>
      <DialogFooter><Button onClick={salvar}>Criar</Button></DialogFooter>
    </>
  );
}
