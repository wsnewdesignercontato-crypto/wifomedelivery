import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  const [permNotif, setPermNotif] = useState<string>("default");

  useEffect(() => {
    if (typeof Notification !== "undefined") setPermNotif(Notification.permission);
  }, []);

  async function pedirPermissao() {
    if (typeof Notification === "undefined") {
      toast.error("Este navegador não suporta notificações");
      return;
    }
    const p = await Notification.requestPermission();
    setPermNotif(p);
    if (p === "granted") toast.success("Notificações habilitadas");
    else toast.info("Permissão não concedida");
  }

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

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-semibold">Permissão de notificação do navegador</p>
          <p className="text-xs text-muted-foreground">
            Status atual:{" "}
            <span className="font-semibold text-foreground">
              {permNotif === "granted"
                ? "Permitido"
                : permNotif === "denied"
                  ? "Bloqueado"
                  : "Não solicitado"}
            </span>
          </p>
        </div>
        <Button size="sm" onClick={pedirPermissao} disabled={permNotif === "granted"}>
          {permNotif === "granted" ? "Já ativado" : "Ativar notificações"}
        </Button>
      </section>

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

      <Button variant="outline" className="w-full" onClick={limparCache}>
        <Trash2 className="mr-2 h-4 w-4" /> Limpar cache do aplicativo
      </Button>
    </div>
  );
}
