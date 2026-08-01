import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bike, Car, Plus, Trash2, Truck, Zap, CheckCircle2, Clock, ShieldCheck, Sparkles } from "lucide-react";
import { useMyCourier } from "@/hooks/use-courier";
import { notifyDataUpdated } from "@/lib/app-refresh";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/entregador/veiculo")({
  component: Veiculo,
});

type V = { id: string; tipo: string; marca: string | null; modelo: string | null; ano: number | null; cor: string | null; placa: string | null; ativo: boolean; status: string };

const TIPOS = [
  { value: "bicicleta", label: "Bicicleta", icon: Bike, motorizado: false },
  { value: "bicicleta_eletrica", label: "Bicicleta elétrica", icon: Zap, motorizado: false },
  { value: "patinete_eletrico", label: "Patinete elétrico", icon: Zap, motorizado: false },
  { value: "moto", label: "Moto", icon: Bike, motorizado: true },
  { value: "carro", label: "Carro", icon: Car, motorizado: true },
  { value: "utilitario", label: "Utilitário", icon: Truck, motorizado: true },
] as const;

function precisaPlaca(tipo?: string) {
  return TIPOS.find((t) => t.value === tipo)?.motorizado ?? true;
}

function iconFor(tipo: string) {
  const t = TIPOS.find((x) => x.value === tipo);
  return t?.icon ?? Car;
}


function statusMeta(status: string) {
  switch (status) {
    case "aprovado":
      return { label: "Aprovado", icon: CheckCircle2, cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" };
    case "rejeitado":
      return { label: "Rejeitado", icon: ShieldCheck, cls: "bg-rose-500/15 text-rose-600 border-rose-500/30" };
    default:
      return { label: "Em análise", icon: Clock, cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" };
  }
}

function Veiculo() {
  const { courier } = useMyCourier();
  const [list, setList] = useState<V[]>([]);
  const [form, setForm] = useState<Partial<V>>({ tipo: "moto", marca: "", modelo: "", ano: undefined, cor: "", placa: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!courier) return;
    const { data } = await supabase.from("courier_vehicles").select("*").eq("courier_id", courier.user_id).order("created_at", { ascending: false });
    setList((data ?? []) as V[]);
  }
  useEffect(() => { load(); }, [courier]);

  async function salvar() {
    if (!courier) return;
    const comPlaca = precisaPlaca(form.tipo);
    const placaLimpa = (form.placa ?? "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (comPlaca && placaLimpa.length < 7) {
      return toast.error("Informe a placa completa (ex.: ABC1D23)");
    }
    setSaving(true);
    const { error } = await supabase.from("courier_vehicles").insert({
      courier_id: courier.user_id,
      tipo: form.tipo!, marca: form.marca, modelo: form.modelo, ano: form.ano, cor: form.cor,
      placa: comPlaca ? placaLimpa : null,
      ativo: list.length === 0,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(
      comPlaca
        ? "Veículo cadastrado — aguardando aprovação"
        : "Veículo cadastrado! Agora envie seu documento com foto em Documentos.",
    );
    setForm({ tipo: form.tipo, marca: "", modelo: "", ano: undefined, cor: "", placa: "" });
    await load();
    notifyDataUpdated();
  }


  async function ativar(id: string) {
    if (!courier) return;
    await supabase.from("courier_vehicles").update({ ativo: false }).eq("courier_id", courier.user_id);
    await supabase.from("courier_vehicles").update({ ativo: true }).eq("id", id);
    toast.success("Veículo ativo alterado");
    await load();
    notifyDataUpdated();
  }

  async function remover(id: string) {
    if (!confirm("Remover este veículo?")) return;
    await supabase.from("courier_vehicles").delete().eq("id", id);
    await load();
    notifyDataUpdated();
  }

  const aprovados = list.filter((v) => v.status === "aprovado").length;
  const ativo = list.find((v) => v.ativo);
  const comPlaca = precisaPlaca(form.tipo);


  return (
    <div className="space-y-8">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary via-primary to-orange-600 p-6 text-white shadow-[0_20px_60px_-15px_rgba(255,107,0,0.55)] md:p-8">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-orange-300/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> Garagem
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">Meus veículos</h1>
            <p className="mt-1 max-w-md text-sm text-white/85">
              Cadastre e gerencie os veículos usados nas suas entregas. O ativo é usado para todas as corridas.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 md:gap-4">
            <MiniStat label="Cadastrados" value={list.length} />
            <MiniStat label="Aprovados" value={aprovados} />
            <MiniStat label="Ativo" value={ativo ? ativo.tipo.replace(/_/g, " ") : "—"} isText />
          </div>
        </div>
      </div>

      {/* Form card */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-card md:p-7">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-orange-500 to-amber-400" />
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Plus className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Adicionar veículo</h2>
            <p className="text-xs text-muted-foreground">Preencha os dados — a plataforma valida em até 24h.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo</Label>
            <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => {
                  const Icon = t.icon;
                  return (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" />{t.label}</span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <FieldInput label="Marca" placeholder="Honda, Yamaha…" value={form.marca ?? ""} onChange={(v) => setForm({ ...form, marca: v })} />
          <FieldInput label="Modelo" placeholder="CG 160, Factor…" value={form.modelo ?? ""} onChange={(v) => setForm({ ...form, modelo: v })} />
          <FieldInput label="Ano" placeholder="2022" type="number" value={form.ano?.toString() ?? ""} onChange={(v) => setForm({ ...form, ano: v ? Number(v) : undefined })} />
          <FieldInput label="Cor" placeholder="Preta, Vermelha…" value={form.cor ?? ""} onChange={(v) => setForm({ ...form, cor: v })} />
          <FieldInput label="Placa" placeholder="ABC1D23" value={form.placa ?? ""} onChange={(v) => setForm({ ...form, placa: v.toUpperCase() })} />
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Ao cadastrar, você confirma que os dados são verdadeiros e o veículo está regularizado.
          </p>
          <Button
            onClick={salvar}
            disabled={saving || !form.tipo}
            size="lg"
            className="rounded-xl bg-primary shadow-[0_10px_30px_-10px_rgba(255,107,0,0.7)] transition-transform hover:scale-[1.02]"
          >
            <Plus className="mr-2 h-4 w-4" />
            {saving ? "Salvando…" : "Adicionar veículo"}
          </Button>
        </div>
      </section>

      {/* List */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="text-lg font-bold tracking-tight">Frota cadastrada</h2>
          <span className="text-xs text-muted-foreground">{list.length} veículo(s)</span>
        </div>

        {list.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-gradient-to-b from-card to-muted/30 p-12 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Car className="h-8 w-8" />
            </div>
            <p className="mt-4 font-semibold">Nenhum veículo cadastrado</p>
            <p className="mt-1 text-sm text-muted-foreground">Adicione seu primeiro veículo acima para começar a receber corridas.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {list.map((v) => {
              const Icon = iconFor(v.tipo);
              const st = statusMeta(v.status);
              const StIcon = st.icon;
              return (
                <div
                  key={v.id}
                  className={`group relative overflow-hidden rounded-2xl border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_40px_-15px_rgba(0,0,0,0.25)] ${v.ativo ? "border-primary/40 ring-2 ring-primary/20" : "border-border"}`}
                >
                  {v.ativo && (
                    <div className="absolute right-0 top-0 rounded-bl-xl bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                      Em uso
                    </div>
                  )}
                  <div className="flex items-start gap-4">
                    <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${v.ativo ? "bg-primary text-white" : "bg-primary/10 text-primary"} shadow-sm`}>
                      <Icon className="h-7 w-7" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold capitalize tracking-tight">
                        {v.tipo.replace(/_/g, " ")}
                        {v.marca && <span className="text-muted-foreground"> · {v.marca}</span>}
                        {v.modelo && <span className="text-muted-foreground"> {v.modelo}</span>}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {v.placa && <span className="rounded-md bg-muted px-2 py-0.5 font-mono font-semibold text-foreground">{v.placa}</span>}
                        {v.cor && <span>{v.cor}</span>}
                        {v.ano && <span>{v.ano}</span>}
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>
                          <StIcon className="h-3 w-3" /> {st.label}
                        </span>
                        {v.ativo && (
                          <Badge className="bg-emerald-500 hover:bg-emerald-500">Ativo</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-end gap-2 border-t border-border/60 pt-3">
                    {!v.ativo && (
                      <Button size="sm" variant="outline" className="rounded-lg" onClick={() => ativar(v.id)}>
                        Tornar ativo
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-600" onClick={() => remover(v.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function MiniStat({ label, value, isText }: { label: string; value: string | number; isText?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/20 bg-white/10 px-3 py-2 backdrop-blur">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70">{label}</p>
      <p className={`mt-0.5 font-black tracking-tight ${isText ? "text-sm capitalize" : "text-2xl"}`}>{value}</p>
    </div>
  );
}

function FieldInput({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Input type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className="h-11 rounded-xl" />
    </div>
  );
}
