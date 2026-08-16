import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { fmtBRL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/cupons")({ component: CuponsPage });

type Coupon = {
  id: string;
  code: string;
  type: "percent" | "fixed" | "free_delivery";
  value_cents: number;
  percent: number;
  ativo: boolean;
  used_count: number;
  usage_limit: number | null;
  expires_at: string | null;
  descricao: string | null;
};

async function fetchCoupons() {
  const { data, error } = await supabase
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Coupon[];
}

function CuponsPage() {
  const { data = [], isLoading } = useQuery({ queryKey: ["coupons"], queryFn: fetchCoupons });
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "",
    type: "percent" as "percent" | "fixed" | "free_delivery",
    percent: 10,
    value_cents: 0,
    descricao: "",
    usage_limit: "",
  });

  async function create() {
    if (!form.code.trim()) return toast.error("Código obrigatório");
    const payload = {
      code: form.code.trim().toUpperCase(),
      type: form.type,
      percent: form.type === "percent" ? form.percent : 0,
      value_cents: form.type === "fixed" ? form.value_cents : 0,
      descricao: form.descricao || null,
      usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
    };
    const { error } = await supabase.from("coupons").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Cupom criado");
    setOpen(false);
    setForm({
      code: "",
      type: "percent",
      percent: 10,
      value_cents: 0,
      descricao: "",
      usage_limit: "",
    });
    qc.invalidateQueries({ queryKey: ["coupons"] });
  }

  async function toggle(c: Coupon) {
    await supabase.from("coupons").update({ ativo: !c.ativo }).eq("id", c.id);
    qc.invalidateQueries({ queryKey: ["coupons"] });
  }

  async function remove(id: string) {
    if (!confirm("Excluir cupom?")) return;
    await supabase.from("coupons").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["coupons"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cupons</h1>
          <p className="text-sm text-muted-foreground">Cupons globais e por estabelecimento.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1 h-4 w-4" />
              Novo cupom
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo cupom</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Código</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="WIFOME10"
                />
              </div>
              <div>
                <Label>Tipo</Label>
                <select
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as "percent" })}
                >
                  <option value="percent">% Desconto</option>
                  <option value="fixed">Valor fixo (R$)</option>
                  <option value="free_delivery">Frete grátis</option>
                </select>
              </div>
              {form.type === "percent" && (
                <div>
                  <Label>% Desconto</Label>
                  <Input
                    type="number"
                    value={form.percent}
                    onChange={(e) => setForm({ ...form, percent: Number(e.target.value) })}
                  />
                </div>
              )}
              {form.type === "fixed" && (
                <div>
                  <Label>Valor (centavos)</Label>
                  <Input
                    type="number"
                    value={form.value_cents}
                    onChange={(e) => setForm({ ...form, value_cents: Number(e.target.value) })}
                  />
                </div>
              )}
              <div>
                <Label>Limite de usos</Label>
                <Input
                  type="number"
                  value={form.usage_limit}
                  onChange={(e) => setForm({ ...form, usage_limit: e.target.value })}
                  placeholder="opcional"
                />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                />
              </div>
              <Button onClick={create} className="w-full">
                Criar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr className="[&>th]:px-4 [&>th]:py-2 [&>th]:text-left">
                <th>Código</th>
                <th>Tipo</th>
                <th>Valor</th>
                <th>Usos</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    Carregando…
                  </td>
                </tr>
              )}
              {!isLoading && data.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    Nenhum cupom.
                  </td>
                </tr>
              )}
              {data.map((c) => (
                <tr key={c.id} className="border-b border-border/50">
                  <td className="px-4 py-2 font-mono font-semibold">{c.code}</td>
                  <td className="px-4 py-2 text-xs">{c.type}</td>
                  <td className="px-4 py-2">
                    {c.type === "percent"
                      ? `${c.percent}%`
                      : c.type === "fixed"
                        ? fmtBRL(c.value_cents)
                        : "Frete grátis"}
                  </td>
                  <td className="px-4 py-2">
                    {c.used_count}
                    {c.usage_limit ? ` / ${c.usage_limit}` : ""}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => toggle(c)}
                      className={`rounded-full px-2 py-0.5 text-xs ${c.ativo ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}
                    >
                      {c.ativo ? "Ativo" : "Inativo"}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button size="icon" variant="ghost" onClick={() => remove(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
