import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyEstab, fmt } from "@/hooks/use-my-estab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { parseMoneyCents } from "@/lib/commerce";

export const Route = createFileRoute("/_authenticated/estabelecimento/cupons")({
  head: () => ({
    meta: [
      { title: "Loja — Cupons | PedeTrem" },
      { name: "description", content: "PedeTrem: loja, cupons." },
      { property: "og:title", content: "Loja — Cupons | PedeTrem" },
      { property: "og:description", content: "PedeTrem: loja, cupons." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CuponsPage,
});

type Coupon = {
  id: string;
  code: string;
  type: string;
  value_cents: number;
  percent: number;
  min_order_cents: number;
  usage_limit: number | null;
  used_count: number;
  ativo: boolean;
};

function CuponsPage() {
  const { estab } = useMyEstab();
  const estabId = estab?.id;
  const [list, setList] = useState<Coupon[]>([]);
  const [open, setOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!estabId) return;
    const { data, error } = await supabase
      .from("coupons")
      .select("id,code,type,value_cents,percent,min_order_cents,usage_limit,used_count,ativo")
      .eq("establishment_id", estabId)
      .order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    setList((data ?? []) as Coupon[]);
  }, [estabId]);
  useEffect(() => {
    void reload();
  }, [reload]);

  async function toggle(c: Coupon) {
    if (!estabId) return;
    const { data, error } = await supabase
      .from("coupons")
      .update({ ativo: !c.ativo })
      .eq("id", c.id)
      .eq("establishment_id", estabId)
      .select("id");
    if (error || data?.length !== 1)
      return toast.error(error?.message ?? "Cupom não encontrado ou sem permissão");
    await reload();
  }
  async function remover(id: string) {
    if (!estabId) return;
    if (!confirm("Excluir cupom?")) return;
    const { data, error } = await supabase
      .from("coupons")
      .delete()
      .eq("id", id)
      .eq("establishment_id", estabId)
      .select("id");
    if (error?.code === "23503")
      return toast.error("Cupom vinculado a pedidos. Desative-o para impedir novos usos.");
    if (error || data?.length !== 1)
      return toast.error(error?.message ?? "Cupom não encontrado ou sem permissão");
    await reload();
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight">Cupons da loja</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Novo cupom
            </Button>
          </DialogTrigger>
          <DialogContent>
            <CupomForm
              onSaved={() => {
                setOpen(false);
                reload();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-2">
        {list.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold">{c.code}</span>
                <Badge>{c.type === "percent" ? `${c.percent}%` : fmt(c.value_cents)}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Usos: {c.used_count}
                {c.usage_limit ? `/${c.usage_limit}` : ""}
                {c.min_order_cents ? ` · Mín ${fmt(c.min_order_cents)}` : ""}
              </p>
            </div>
            <Switch checked={c.ativo} onCheckedChange={() => toggle(c)} />
            <Button size="icon" variant="ghost" onClick={() => remover(c.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
        {list.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cupom criado.</p>}
      </div>
    </div>
  );
}

function CupomForm({ onSaved }: { onSaved: () => void }) {
  const { estab } = useMyEstab();
  const [f, setF] = useState({ code: "", type: "percent", valor: "10", minimo: "", usos: "" });
  const [saving, setSaving] = useState(false);
  async function salvar() {
    if (saving) return;
    if (!estab || !f.code.trim()) return toast.error("Código obrigatório");
    if (f.code.trim().length > 50) return toast.error("Código deve ter até 50 caracteres");
    const minimum = f.minimo ? parseMoneyCents(f.minimo) : 0;
    const amount = parseMoneyCents(f.valor);
    const percent = /^\d+(?:[,.]\d{1,2})?$/.test(f.valor.trim())
      ? Number(f.valor.replace(",", "."))
      : NaN;
    const uses = f.usos ? Number(f.usos) : null;
    if (
      minimum === null ||
      (uses !== null &&
        (!/^\d+$/.test(f.usos) || !Number.isSafeInteger(uses) || uses < 1 || uses > 2147483647))
    )
      return toast.error("Mínimo ou limite de usos inválido");
    if (
      f.type === "percent"
        ? !Number.isFinite(percent) || percent <= 0 || percent > 100
        : amount === null || amount <= 0
    )
      return toast.error("Informe um desconto válido");
    const payload = {
      establishment_id: estab.id,
      code: f.code.trim().toUpperCase(),
      type: f.type as "percent" | "fixed",
      ativo: true,
      min_order_cents: minimum,
      usage_limit: uses,
      value_cents: f.type === "fixed" ? (amount ?? 0) : 0,
      percent: f.type === "percent" ? percent : 0,
    };
    setSaving(true);
    const { error } = await supabase.from("coupons").insert(payload);
    setSaving(false);
    if (error) toast.error("Falha: " + error.message);
    else {
      toast.success("Cupom criado");
      onSaved();
    }
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>Novo cupom</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        <div>
          <Label>Código</Label>
          <Input
            value={f.code}
            onChange={(e) => setF({ ...f, code: e.target.value })}
            placeholder="WELCOME10"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Tipo</Label>
            <select
              className="w-full rounded-md border border-input bg-background p-2 text-sm"
              value={f.type}
              onChange={(e) => setF({ ...f, type: e.target.value })}
            >
              <option value="percent">Percentual (%)</option>
              <option value="fixed">Valor fixo (R$)</option>
            </select>
          </div>
          <div>
            <Label>Valor</Label>
            <Input value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Pedido mínimo (R$)</Label>
            <Input value={f.minimo} onChange={(e) => setF({ ...f, minimo: e.target.value })} />
          </div>
          <div>
            <Label>Usos máximos</Label>
            <Input value={f.usos} onChange={(e) => setF({ ...f, usos: e.target.value })} />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={salvar} disabled={saving}>
          {saving ? "Criando…" : "Criar"}
        </Button>
      </DialogFooter>
    </>
  );
}
