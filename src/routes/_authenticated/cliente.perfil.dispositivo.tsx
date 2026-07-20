import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Smartphone, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/cliente/perfil/dispositivo")({
  component: DispositivoPage,
});

type DevPrefs = {
  som: boolean;
  vibracao: boolean;
  localizacao: boolean;
  modo_escuro_auto: boolean;
  economia_dados: boolean;
};

const DEFAULTS: DevPrefs = {
  som: true,
  vibracao: true,
  localizacao: true,
  modo_escuro_auto: true,
  economia_dados: false,
};

const KEY = "wifome:device-prefs";

function DispositivoPage() {
  const [prefs, setPrefs] = useState<DevPrefs>(DEFAULTS);
  const [permNotif, setPermNotif] = useState<string>("default");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setPrefs({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
    if (typeof Notification !== "undefined") setPermNotif(Notification.permission);
  }, []);

  function update<K extends keyof DevPrefs>(k: K, v: DevPrefs[K]) {
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  }

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
      const keep = ["wifome:notif-prefs", "wifome:device-prefs"];
      Object.keys(localStorage)
        .filter((k) => !keep.includes(k))
        .forEach((k) => localStorage.removeItem(k));
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      toast.success("Cache limpo");
    } catch {
      toast.error("Não foi possível limpar tudo");
    }
  }

  const rows: Array<{ key: keyof DevPrefs; title: string; desc: string }> = [
    { key: "som", title: "Som", desc: "Emitir som ao receber notificações" },
    { key: "vibracao", title: "Vibração", desc: "Vibrar em alertas importantes" },
    { key: "localizacao", title: "Localização", desc: "Usar GPS para melhores entregas" },
    { key: "modo_escuro_auto", title: "Modo escuro automático", desc: "Seguir preferência do sistema" },
    { key: "economia_dados", title: "Economia de dados", desc: "Carregar imagens em qualidade menor" },
  ];

  return (
    <div className="space-y-5">
      <Link to="/cliente/perfil" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
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
            <Switch checked={prefs[r.key]} onCheckedChange={(v) => update(r.key, v)} />
          </div>
        ))}
      </div>

      <Button variant="outline" className="w-full" onClick={limparCache}>
        <Trash2 className="mr-2 h-4 w-4" /> Limpar cache do aplicativo
      </Button>
    </div>
  );
}
