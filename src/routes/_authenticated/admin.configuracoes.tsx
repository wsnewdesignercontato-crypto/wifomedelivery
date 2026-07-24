import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Settings, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  component: ConfigPage,
});

type Config = {
  id: number;
  platform_name: string;
  commission_pct: number;
  default_delivery_fee_cents: number;
  default_radius_km: number;
  maintenance_mode: boolean;
  bestseller_threshold: number;
  ad_default_seconds: number;
  score_delay_warn_ratio: number;
  score_delay_warn_penalty: number;
  score_delay_severe_ratio: number;
  score_delay_severe_penalty: number;
  score_review_bad_max: number;
  score_review_bad_penalty: number;
  score_review_regular_rating: number;
  score_review_regular_penalty: number;
};

async function fetchConfig() {
  const { data, error } = await supabase.from("platform_settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return data as Config;
}

function ConfigPage() {
  const { data, isLoading } = useQuery({ queryKey: ["platform-settings"], queryFn: fetchConfig });
  const qc = useQueryClient();
  const [form, setForm] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  async function save() {
    if (!form) return;
    setSaving(true);
    const uid = (await supabase.auth.getUser()).data.user!.id;
    const { error } = await supabase
      .from("platform_settings")
      .update({
        platform_name: form.platform_name,
        commission_pct: form.commission_pct,
        default_delivery_fee_cents: form.default_delivery_fee_cents,
        default_radius_km: form.default_radius_km,
        maintenance_mode: form.maintenance_mode,
        bestseller_threshold: form.bestseller_threshold,
        ad_default_seconds: form.ad_default_seconds,
        score_delay_warn_ratio: form.score_delay_warn_ratio,
        score_delay_warn_penalty: form.score_delay_warn_penalty,
        score_delay_severe_ratio: form.score_delay_severe_ratio,
        score_delay_severe_penalty: form.score_delay_severe_penalty,
        score_review_bad_max: form.score_review_bad_max,
        score_review_bad_penalty: form.score_review_bad_penalty,
        score_review_regular_rating: form.score_review_regular_rating,
        score_review_regular_penalty: form.score_review_regular_penalty,
        updated_by: uid,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    setSaving(false);
    if (error) return toast.error("Falha ao salvar");
    toast.success("Configurações salvas");
    await supabase.from("admin_audit_log").insert({
      admin_id: uid,
      action: "update_settings",
      entity_type: "platform_settings",
      entity_id: "1",
    });
    qc.invalidateQueries({ queryKey: ["platform-settings"] });
  }

  if (isLoading || !form) {
    return <div className="h-64 animate-pulse rounded-2xl bg-muted" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Settings className="h-6 w-6 text-primary" /> Configurações
        </h1>
        <p className="text-sm text-muted-foreground">Regras globais da plataforma.</p>
      </div>

      <div className="max-w-2xl space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div>
          <Label htmlFor="nome">Nome da plataforma</Label>
          <Input
            id="nome"
            value={form.platform_name}
            onChange={(e) => setForm({ ...form, platform_name: e.target.value })}
            className="mt-1.5"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="com">Comissão (%)</Label>
            <Input
              id="com"
              type="number"
              step="0.5"
              value={form.commission_pct}
              onChange={(e) => setForm({ ...form, commission_pct: Number(e.target.value) })}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="tax">Taxa entrega padrão (R$)</Label>
            <Input
              id="tax"
              type="number"
              step="0.5"
              value={(form.default_delivery_fee_cents / 100).toFixed(2)}
              onChange={(e) =>
                setForm({ ...form, default_delivery_fee_cents: Math.round(Number(e.target.value) * 100) })
              }
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="rad">Raio padrão (km)</Label>
            <Input
              id="rad"
              type="number"
              step="0.5"
              value={form.default_radius_km}
              onChange={(e) => setForm({ ...form, default_radius_km: Number(e.target.value) })}
              className="mt-1.5"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="best">Vendas mínimas para selo "Mais vendido"</Label>
          <Input
            id="best"
            type="number"
            min={1}
            value={form.bestseller_threshold}
            onChange={(e) => setForm({ ...form, bestseller_threshold: Number(e.target.value) })}
            className="mt-1.5"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Estabelecimentos com pelo menos esse número de pedidos entregues ganham o selo laranja "Mais vendido".
          </p>
        </div>
        <div>
          <Label htmlFor="adsec">Duração de cada anúncio no rotador (segundos)</Label>
          <Input
            id="adsec"
            type="number"
            min={3}
            max={60}
            value={form.ad_default_seconds}
            onChange={(e) => setForm({ ...form, ad_default_seconds: Number(e.target.value) })}
            className="mt-1.5"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Tempo padrão de exibição de cada anúncio antes de girar para o próximo. Sugerido: 5 a 10 segundos.
          </p>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border bg-background/50 p-4">
          <div>
            <p className="font-medium">Modo manutenção</p>
            <p className="text-xs text-muted-foreground">Bloqueia novos pedidos na plataforma.</p>
          </div>
          <Switch
            checked={form.maintenance_mode}
            onCheckedChange={(v) => setForm({ ...form, maintenance_mode: v })}
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      </div>
    </div>
  );
}
