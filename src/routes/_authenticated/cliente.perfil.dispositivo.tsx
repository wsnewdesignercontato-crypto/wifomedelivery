import { createFileRoute, Link } from "@tanstack/react-router";
import { PushToggleCard } from "@/components/push-toggle-card";
import { toast } from "sonner";
import { ChevronLeft, Smartphone, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useDevicePreferences } from "@/hooks/use-device-preferences";
import { clearDeviceCache, type DevicePreferences } from "@/lib/device-preferences";

export const Route = createFileRoute("/_authenticated/cliente/perfil/dispositivo")({
  head: () => ({
    meta: [
      { title: "Cliente — Perfil — Dispositivo | PedeTrem" },
      { name: "description", content: "PedeTrem: cliente, perfil, dispositivo." },
      { property: "og:title", content: "Cliente — Perfil — Dispositivo | PedeTrem" },
      { property: "og:description", content: "PedeTrem: cliente, perfil, dispositivo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DispositivoPage,
});

function DispositivoPage() {
  const { prefs, updatePreference } = useDevicePreferences();
  async function limparCache() {
    try {
      await clearDeviceCache();
      toast.success("Cache limpo");
    } catch {
      toast.error("Não foi possível limpar tudo");
    }
  }

  const rows: Array<{ key: keyof DevicePreferences; title: string; desc: string }> = [
    { key: "som", title: "Som", desc: "Emitir som ao receber notificações" },
    { key: "vibracao", title: "Vibração", desc: "Vibrar em alertas importantes" },
    { key: "localizacao", title: "Localização", desc: "Usar GPS para melhores entregas" },
    {
      key: "modo_escuro_auto",
      title: "Modo escuro automático",
      desc: "Seguir preferência do sistema",
    },
    {
      key: "economia_dados",
      title: "Economia de dados",
      desc: "Reduzir atualizações automáticas e pausar vídeos de anúncios",
    },
  ];

  return (
    <div className="space-y-5">
      <Link
        to="/cliente/perfil"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <Smartphone className="h-5 w-5 text-primary" /> Configurações do dispositivo
      </h1>

      <PushToggleCard showTest={false} />

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {rows.map((r, i) => (
          <div
            key={r.key}
            className={`flex items-center justify-between gap-4 px-4 py-3.5 ${
              i > 0 ? "border-t border-border" : ""
            }`}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold">{r.title}</p>
              <p className="text-xs text-muted-foreground">{r.desc}</p>
            </div>
            <Switch
              aria-label={r.title}
              checked={prefs[r.key]}
              onCheckedChange={(v) => updatePreference(r.key, v)}
            />
          </div>
        ))}
      </div>

      <Button variant="default" className="w-full" onClick={limparCache}>
        <Trash2 className="mr-2 h-4 w-4" /> Limpar cache do aplicativo
      </Button>
    </div>
  );
}
