import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { PushToggleCard } from "@/components/push-toggle-card";

export const Route = createFileRoute("/_authenticated/cliente/perfil/notificacoes")({
  component: NotifPage,
});

type Prefs = {
  push_pedidos: boolean;
  push_promos: boolean;
  email_promos: boolean;
  email_novidades: boolean;
  sms_pedidos: boolean;
  whatsapp: boolean;
};

const DEFAULTS: Prefs = {
  push_pedidos: true,
  push_promos: true,
  email_promos: false,
  email_novidades: true,
  sms_pedidos: false,
  whatsapp: true,
};

const KEY = "wifome:notif-prefs";

function NotifPage() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setPrefs({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
  }, []);

  function update<K extends keyof Prefs>(k: K, v: Prefs[K]) {
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    localStorage.setItem(KEY, JSON.stringify(next));
    toast.success("Preferência atualizada");
  }

  const rows: Array<{ key: keyof Prefs; title: string; desc: string }> = [
    { key: "push_pedidos", title: "Push — Status do pedido", desc: "Aceite, preparo, entrega, etc." },
    { key: "push_promos", title: "Push — Promoções", desc: "Cupons e ofertas relâmpago" },
    { key: "email_promos", title: "E-mail — Promoções", desc: "Ofertas semanais no seu inbox" },
    { key: "email_novidades", title: "E-mail — Novidades", desc: "Novos restaurantes e recursos" },
    { key: "sms_pedidos", title: "SMS — Status do pedido", desc: "Aviso curto no celular" },
    { key: "whatsapp", title: "WhatsApp", desc: "Atualizações importantes via WhatsApp" },
  ];

  return (
    <div className="space-y-5">
      <Link to="/cliente/perfil" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ChevronLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <Bell className="h-5 w-5 text-primary" /> Notificações
      </h1>
      <p className="text-sm text-muted-foreground">
        Escolha como o WiFome pode te avisar sobre pedidos, promoções e novidades.
      </p>

      <PushToggleCard />

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
    </div>
  );
}
