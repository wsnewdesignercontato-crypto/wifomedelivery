import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Building2, Headphones, Power, SlidersHorizontal } from "lucide-react";
import { AdminSettingsLayout } from "@/components/admin/settings-layout";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PaymentTestSettings } from "@/components/admin/payment-test-settings";
import { BrevoSettings } from "@/components/admin/brevo-settings";
import { AsaasSettings } from "@/components/admin/asaas-settings";
import { persistPlatformSettings } from "@/lib/admin-settings-save";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  head: () => ({
    meta: [
      { title: "Admin — Configurações | PedeTrem" },
      { name: "description", content: "PedeTrem: admin, configurações." },
      { property: "og:title", content: "Admin — Configurações | PedeTrem" },
      { property: "og:description", content: "PedeTrem: admin, configurações." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConfigPage,
});

type Config = {
  id: number;
  platform_name: string;
  commission_pct: number;
  courier_commission_pct: number;
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
  score_start: number;
  score_band_warn: number;
  score_band_critical: number;
  support_email: string | null;
  support_whatsapp: string | null;
  support_phone: string | null;
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
    if (!form || saving) return;
    setSaving(true);
    try {
      const saved = await persistPlatformSettings({
        platform_name: form.platform_name,
        commission_pct: form.commission_pct,
        courier_commission_pct: form.courier_commission_pct,
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
        score_start: form.score_start,
        score_band_warn: form.score_band_warn,
        score_band_critical: form.score_band_critical,
        support_email: form.support_email?.trim() || null,
        support_whatsapp: form.support_whatsapp?.trim() || null,
        support_phone: form.support_phone?.trim() || null,
      });
      setForm(saved);
      qc.setQueryData(["platform-settings"], saved);
      toast.success("Configurações salvas");
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Falha ao salvar as configurações");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !form) {
    return <div className="h-64 animate-pulse rounded-2xl bg-muted" />;
  }

  return (
    <AdminSettingsLayout
      saving={saving}
      onSave={save}
      general={
        <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <section className="min-w-0 space-y-5 rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-6">
            <div className="mb-1 flex items-center gap-3 border-b border-border/70 pb-5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/8 text-primary">
                <Building2 className="size-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold">Identidade e operação</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  O básico para deixar sua plataforma do seu jeito.
                </p>
              </div>
            </div>
            <div>
              <Label htmlFor="nome">Nome da plataforma</Label>
              <Input
                id="nome"
                value={form.platform_name}
                onChange={(e) => setForm({ ...form, platform_name: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                <Label htmlFor="courier-com">Taxa sobre o frete (%)</Label>
                <Input
                  id="courier-com"
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={form.courier_commission_pct}
                  onChange={(e) =>
                    setForm({ ...form, courier_commission_pct: Number(e.target.value) })
                  }
                  className="mt-1.5"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Retida pela plataforma. O entregador recebe o restante do frete.
                </p>
              </div>
              <div>
                <Label htmlFor="tax">Taxa entrega padrão (R$)</Label>
                <Input
                  id="tax"
                  type="number"
                  step="0.5"
                  value={(form.default_delivery_fee_cents / 100).toFixed(2)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      default_delivery_fee_cents: Math.round(Number(e.target.value) * 100),
                    })
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
                Estabelecimentos com pelo menos esse número de pedidos entregues ganham o selo
                laranja "Mais vendido".
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
                Tempo padrão de exibição de cada anúncio antes de girar para o próximo. Sugerido: 5
                a 10 segundos.
              </p>
            </div>
          </section>
          <div className="min-w-0 space-y-6">
            <section className="min-w-0 space-y-4 rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/8 text-primary">
                  <Headphones className="size-5" />
                </span>
                <div>
                  <h2 className="text-base font-semibold">Atendimento e suporte</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Seus canais de contato com os usuários.
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Informe os canais reais da equipe. Campos vazios não aparecem no aplicativo. Use
                Salvar alterações ao terminar.
              </p>
              <div>
                <Label htmlFor="support-email">E-mail</Label>
                <Input
                  id="support-email"
                  type="email"
                  maxLength={254}
                  value={form.support_email ?? ""}
                  onChange={(e) => setForm({ ...form, support_email: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="support-whatsapp">WhatsApp com país e DDD (somente números)</Label>
                <Input
                  id="support-whatsapp"
                  placeholder="5531999999999"
                  maxLength={15}
                  value={form.support_whatsapp ?? ""}
                  onChange={(e) => setForm({ ...form, support_whatsapp: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="support-phone">Telefone com país e DDD</Label>
                <Input
                  id="support-phone"
                  placeholder="+5531999999999"
                  maxLength={16}
                  value={form.support_phone ?? ""}
                  onChange={(e) => setForm({ ...form, support_phone: e.target.value })}
                />
              </div>
            </section>
            <div className="flex min-w-0 items-start justify-between gap-4 rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-6">
              <div>
                <p id="maintenance-label" className="flex items-center gap-2 text-sm font-semibold">
                  <Power className="size-4 text-primary" /> Modo manutenção
                </p>
                <p className="text-xs text-muted-foreground">
                  Bloqueia novos pedidos na plataforma.
                </p>
              </div>
              <Switch
                aria-labelledby="maintenance-label"
                checked={form.maintenance_mode}
                onCheckedChange={(v) => setForm({ ...form, maintenance_mode: v })}
              />
            </div>
          </div>
        </div>
      }
      payments={
        <div className="grid min-w-0 items-start gap-6 2xl:grid-cols-2">
          <AsaasSettings />
          <PaymentTestSettings />
        </div>
      }
      email={<BrevoSettings />}
      quality={
        <div className="grid min-w-0 items-start gap-6 xl:grid-cols-2">
          <section className="min-w-0 space-y-5 rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-6 xl:col-span-2">
            <div className="flex items-start gap-3 border-b border-border/70 pb-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
                <SlidersHorizontal className="size-5" />
              </span>
              <div>
                <p className="font-semibold">Score mensal de qualidade</p>
                <p className="text-xs text-muted-foreground">
                  Regras de perda de pontos para estabelecimentos e entregadores. Cada mês começa no
                  valor inicial abaixo.
                </p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Faixas e valor inicial</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="ss">Valor inicial mensal</Label>
                  <Input
                    id="ss"
                    type="number"
                    min={1}
                    max={1000}
                    value={form.score_start}
                    onChange={(e) => setForm({ ...form, score_start: Number(e.target.value) })}
                    className="mt-1.5"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Padrão: 100. Todo mês recomeça neste valor.
                  </p>
                </div>
                <div>
                  <Label htmlFor="sbw">Faixa "Atenção" abaixo de</Label>
                  <Input
                    id="sbw"
                    type="number"
                    min={1}
                    max={1000}
                    value={form.score_band_warn}
                    onChange={(e) => setForm({ ...form, score_band_warn: Number(e.target.value) })}
                    className="mt-1.5"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Notifica em amarelo ao cair abaixo. Padrão: 85.
                  </p>
                </div>
                <div>
                  <Label htmlFor="sbc">Faixa "Crítico" abaixo de</Label>
                  <Input
                    id="sbc"
                    type="number"
                    min={1}
                    max={1000}
                    value={form.score_band_critical}
                    onChange={(e) =>
                      setForm({ ...form, score_band_critical: Number(e.target.value) })
                    }
                    className="mt-1.5"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Notifica em vermelho ao cair abaixo. Padrão: 60.
                  </p>
                </div>
              </div>
            </div>
          </section>
          <section className="min-w-0 rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-6">
            <div>
              <p className="mb-2 text-sm font-medium">Atrasos na entrega</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="dwr">Atenção: proporção de atraso &gt;</Label>
                  <Input
                    id="dwr"
                    type="number"
                    step="0.05"
                    min={1}
                    value={form.score_delay_warn_ratio}
                    onChange={(e) =>
                      setForm({ ...form, score_delay_warn_ratio: Number(e.target.value) })
                    }
                    className="mt-1.5"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Ex: 1.25 = 25% além do tempo estimado.
                  </p>
                </div>
                <div>
                  <Label htmlFor="dwp">Pontos perdidos (atenção)</Label>
                  <Input
                    id="dwp"
                    type="number"
                    min={0}
                    value={form.score_delay_warn_penalty}
                    onChange={(e) =>
                      setForm({ ...form, score_delay_warn_penalty: Number(e.target.value) })
                    }
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="dsr">Severo: proporção de atraso &gt;</Label>
                  <Input
                    id="dsr"
                    type="number"
                    step="0.05"
                    min={1}
                    value={form.score_delay_severe_ratio}
                    onChange={(e) =>
                      setForm({ ...form, score_delay_severe_ratio: Number(e.target.value) })
                    }
                    className="mt-1.5"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Ex: 1.5 = 50% além do tempo estimado.
                  </p>
                </div>
                <div>
                  <Label htmlFor="dsp">Pontos perdidos (severo)</Label>
                  <Input
                    id="dsp"
                    type="number"
                    min={0}
                    value={form.score_delay_severe_penalty}
                    onChange={(e) =>
                      setForm({ ...form, score_delay_severe_penalty: Number(e.target.value) })
                    }
                    className="mt-1.5"
                  />
                </div>
              </div>
            </div>
          </section>
          <section className="min-w-0 rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-6">
            <div>
              <p className="mb-2 text-sm font-medium">Avaliações baixas</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="rbm">Nota máxima considerada "ruim" (★)</Label>
                  <Input
                    id="rbm"
                    type="number"
                    min={1}
                    max={5}
                    value={form.score_review_bad_max}
                    onChange={(e) =>
                      setForm({ ...form, score_review_bad_max: Number(e.target.value) })
                    }
                    className="mt-1.5"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Notas ≤ este valor perdem os pontos abaixo.
                  </p>
                </div>
                <div>
                  <Label htmlFor="rbp">Pontos perdidos (ruim)</Label>
                  <Input
                    id="rbp"
                    type="number"
                    min={0}
                    value={form.score_review_bad_penalty}
                    onChange={(e) =>
                      setForm({ ...form, score_review_bad_penalty: Number(e.target.value) })
                    }
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="rrr">Nota "regular" (★)</Label>
                  <Input
                    id="rrr"
                    type="number"
                    min={1}
                    max={5}
                    value={form.score_review_regular_rating}
                    onChange={(e) =>
                      setForm({ ...form, score_review_regular_rating: Number(e.target.value) })
                    }
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="rrp">Pontos perdidos (regular)</Label>
                  <Input
                    id="rrp"
                    type="number"
                    min={0}
                    value={form.score_review_regular_penalty}
                    onChange={(e) =>
                      setForm({ ...form, score_review_regular_penalty: Number(e.target.value) })
                    }
                    className="mt-1.5"
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      }
    />
  );
}
