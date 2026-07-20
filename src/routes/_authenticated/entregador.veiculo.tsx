import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Car, Plus, Trash2 } from "lucide-react";
import { useMyCourier } from "@/hooks/use-courier";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/entregador/veiculo")({
  component: Veiculo,
});

type V = { id: string; tipo: string; marca: string | null; modelo: string | null; ano: number | null; cor: string | null; placa: string | null; ativo: boolean; status: string };

const TIPOS = ["bicicleta", "bicicleta_eletrica", "moto", "carro", "utilitario"];

function Veiculo() {
  const { courier } = useMyCourier();
  const [list, setList] = useState<V[]>([]);
  const [form, setForm] = useState<Partial<V>>({ tipo: "moto", marca: "", modelo: "", ano: undefined, cor: "", placa: "" });

  async function load() {
    if (!courier) return;
    const { data } = await supabase.from("courier_vehicles").select("*").eq("courier_id", courier.user_id).order("created_at", { ascending: false });
    setList((data ?? []) as V[]);
  }
  useEffect(() => { load(); }, [courier]);

  async function salvar() {
    if (!courier) return;
    const { error } = await supabase.from("courier_vehicles").insert({
      courier_id: courier.user_id,
      tipo: form.tipo!, marca: form.marca, modelo: form.modelo, ano: form.ano, cor: form.cor, placa: form.placa,
      ativo: list.length === 0,
    });
    if (error) return toast.error(error.message);
    toast.success("Veículo cadastrado — aguardando aprovação");
    setForm({ tipo: "moto", marca: "", modelo: "", ano: undefined, cor: "", placa: "" });
    load();
  }

  async function ativar(id: string) {
    if (!courier) return;
    await supabase.from("courier_vehicles").update({ ativo: false }).eq("courier_id", courier.user_id);
    await supabase.from("courier_vehicles").update({ ativo: true }).eq("id", id);
    toast.success("Veículo ativo alterado");
    load();
  }

  async function remover(id: string) {
    await supabase.from("courier_vehicles").delete().eq("id", id);
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">Meus veículos</h1>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <h2 className="mb-3 font-semibold">Adicionar veículo</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Tipo</Label>
            <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Marca</Label><Input value={form.marca ?? ""} onChange={(e) => setForm({ ...form, marca: e.target.value })} /></div>
          <div><Label>Modelo</Label><Input value={form.modelo ?? ""} onChange={(e) => setForm({ ...form, modelo: e.target.value })} /></div>
          <div><Label>Ano</Label><Input type="number" value={form.ano ?? ""} onChange={(e) => setForm({ ...form, ano: Number(e.target.value) })} /></div>
          <div><Label>Cor</Label><Input value={form.cor ?? ""} onChange={(e) => setForm({ ...form, cor: e.target.value })} /></div>
          <div><Label>Placa</Label><Input value={form.placa ?? ""} onChange={(e) => setForm({ ...form, placa: e.target.value })} /></div>
        </div>
        <Button className="mt-3" onClick={salvar}><Plus className="mr-2 h-4 w-4" />Adicionar</Button>
      </section>

      <section>
        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <Car className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Nenhum veículo cadastrado.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {list.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-card">
                <div>
                  <p className="font-semibold capitalize">{v.tipo.replace(/_/g, " ")} · {v.marca} {v.modelo}</p>
                  <p className="text-xs text-muted-foreground">{v.placa} · {v.cor} · {v.ano ?? "—"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={v.status === "aprovado" ? "default" : "secondary"}>{v.status}</Badge>
                  {v.ativo ? <Badge>Ativo</Badge> : <Button size="sm" variant="outline" onClick={() => ativar(v.id)}>Ativar</Button>}
                  <Button size="icon" variant="ghost" onClick={() => remover(v.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
