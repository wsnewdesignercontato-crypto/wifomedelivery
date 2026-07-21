import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Bell, Smartphone, HelpCircle, LogOut, ChevronRight, Volume2, Vibrate, MapPin,
  Moon, Wifi, Trash2, MessageCircle, Mail, Phone, ChevronDown, Shield, User,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/entregador/configuracoes")({
  component: Cfg,
});

type Prefs = {
  som_corridas: boolean;
  vibracao: boolean;
  push_corridas: boolean;
  alto_volume: boolean;
  push_pagamento: boolean;
  push_promos: boolean;
  email_recibos: boolean;
  whatsapp: boolean;
  localizacao: boolean;
  modo_escuro_auto: boolean;
  economia_dados: boolean;
};

const DEFAULTS: Prefs = {
  som_corridas: true,
  vibracao: true,
  push_corridas: true,
  alto_volume: true,
  push_pagamento: true,
  push_promos: false,
  email_recibos: true,
  whatsapp: true,
  localizacao: true,
  modo_escuro_auto: true,
  economia_dados: false,
};

const KEY = "wifome_courier_prefs";

const FAQS = [
  { q: "Como aceitar uma corrida?", a: "Fique online no painel Início e toque em Aceitar quando uma corrida aparecer. Só um entregador pode aceitar por corrida." },
  { q: "Como confirmar a entrega?", a: "Peça o código de 4 dígitos ao cliente. Se for entrega sem contato, envie a foto da prova de entrega." },
  { q: "Quando recebo meus ganhos?", a: "Os ganhos ficam disponíveis para saque via Pix após a entrega ser finalizada, respeitando as regras da plataforma." },
  { q: "Meu KYC foi recusado, e agora?", a: "Vá em Perfil → Documentos, corrija o que foi apontado e reenvie para nova análise." },
];

function Cfg() {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [permNotif, setPermNotif] = useState<string>("default");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    try {
      const s = localStorage.getItem(KEY);
      if (s) setPrefs({ ...DEFAULTS, ...JSON.parse(s) });
    } catch {}
    if (typeof Notification !== "undefined") setPermNotif(Notification.permission);
  }, []);

  function update<K extends keyof Prefs>(k: K, v: Prefs[K]) {
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  }

  async function pedirPermissao() {
    if (typeof Notification === "undefined") return toast.error("Navegador sem suporte a notificações");
    const p = await Notification.requestPermission();
    setPermNotif(p);
    if (p === "granted") toast.success("Notificações habilitadas");
  }

  async function limparCache() {
    try {
      const keep = [KEY, "wifome:device-prefs"];
      Object.keys(localStorage).filter((k) => !keep.includes(k)).forEach((k) => localStorage.removeItem(k));
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      toast.success("Cache limpo");
    } catch { toast.error("Falha ao limpar cache"); }
  }

  async function sair() {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  const notifRows: Array<{ key: keyof Prefs; icon: typeof Bell; title: string; desc: string }> = [
    { key: "push_corridas", icon: Bell, title: "Push — Novas corridas", desc: "Alerta imediato quando surgir uma corrida" },
    { key: "som_corridas", icon: Volume2, title: "Som de corrida", desc: "Sirene para não perder pedidos" },
    { key: "alto_volume", icon: Volume2, title: "Volume alto", desc: "Reforça o som mesmo com o celular no bolso" },
    { key: "vibracao", icon: Vibrate, title: "Vibração", desc: "Vibrar em alertas importantes" },
    { key: "push_pagamento", icon: Bell, title: "Push — Pagamentos e saques", desc: "Aviso quando o saque cair no Pix" },
    { key: "push_promos", icon: Bell, title: "Push — Bônus e promoções", desc: "Metas e incentivos da plataforma" },
    { key: "email_recibos", icon: Mail, title: "E-mail — Recibos e extratos", desc: "Comprovantes semanais no seu inbox" },
    { key: "whatsapp", icon: MessageCircle, title: "WhatsApp", desc: "Atualizações importantes via WhatsApp" },
  ];

  const devRows: Array<{ key: keyof Prefs; icon: typeof Bell; title: string; desc: string }> = [
    { key: "localizacao", icon: MapPin, title: "Localização", desc: "GPS para receber corridas próximas" },
    { key: "modo_escuro_auto", icon: Moon, title: "Modo escuro automático", desc: "Segue a preferência do sistema" },
    { key: "economia_dados", icon: Wifi, title: "Economia de dados", desc: "Imagens em qualidade menor" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Ajuste alertas, dispositivo, conta e suporte.</p>
      </div>

      {/* Acesso rápido ao perfil */}
      <section className="grid gap-2 sm:grid-cols-3">
        <Link to="/entregador/perfil/dados" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:bg-muted/40">
          <User className="h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Meus dados</p>
            <p className="truncate text-xs text-muted-foreground">Foto, telefone, CPF e CNH</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
        <Link to="/entregador/perfil/pagamento" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:bg-muted/40">
          <Shield className="h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Dados de pagamento</p>
            <p className="truncate text-xs text-muted-foreground">Pix e dados bancários</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
        <Link to="/entregador/documentos" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:bg-muted/40">
          <Shield className="h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Documentos</p>
            <p className="truncate text-xs text-muted-foreground">CNH, CRLV e selfie</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </section>

      {/* Notificações */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <Bell className="h-3.5 w-3.5" /> Notificações
        </h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {notifRows.map((r, i) => (
            <div key={r.key} className={`flex items-center justify-between gap-4 px-4 py-3.5 ${i > 0 ? "border-t border-border" : ""}`}>
              <div className="flex min-w-0 items-center gap-3">
                <r.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{r.desc}</p>
                </div>
              </div>
              <Switch checked={prefs[r.key]} onCheckedChange={(v) => update(r.key, v)} />
            </div>
          ))}
        </div>
      </section>

      {/* Dispositivo */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <Smartphone className="h-3.5 w-3.5" /> Dispositivo
        </h2>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Permissão de notificação</p>
              <p className="text-xs text-muted-foreground">
                Status:{" "}
                <span className="font-semibold text-foreground">
                  {permNotif === "granted" ? "Permitido" : permNotif === "denied" ? "Bloqueado" : "Não solicitado"}
                </span>
              </p>
            </div>
            <Button size="sm" onClick={pedirPermissao} disabled={permNotif === "granted"}>
              {permNotif === "granted" ? "Já ativado" : "Ativar"}
            </Button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {devRows.map((r, i) => (
              <div key={r.key} className={`flex items-center justify-between gap-4 px-4 py-3.5 ${i > 0 ? "border-t border-border" : ""}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <r.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{r.title}</p>
                    <p className="text-xs text-muted-foreground">{r.desc}</p>
                  </div>
                </div>
                <Switch checked={prefs[r.key]} onCheckedChange={(v) => update(r.key, v)} />
              </div>
            ))}
          </div>
          <Button variant="outline" className="w-full" onClick={limparCache}>
            <Trash2 className="mr-2 h-4 w-4" /> Limpar cache do aplicativo
          </Button>
        </div>
      </section>

      {/* Ajuda */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <HelpCircle className="h-3.5 w-3.5" /> Ajuda e suporte
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <a href="https://wa.me/5500000000000" target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card p-3 text-center hover:bg-muted/40">
            <MessageCircle className="h-5 w-5 text-primary" />
            <span className="text-xs font-semibold">Chat</span>
          </a>
          <a href="mailto:entregador@wifome.com.br" className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card p-3 text-center hover:bg-muted/40">
            <Mail className="h-5 w-5 text-primary" />
            <span className="text-xs font-semibold">E-mail</span>
          </a>
          <a href="tel:+5508000000000" className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card p-3 text-center hover:bg-muted/40">
            <Phone className="h-5 w-5 text-primary" />
            <span className="text-xs font-semibold">Telefone</span>
          </a>
        </div>
        <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card">
          {FAQS.map((f, i) => {
            const isOpen = openFaq === i;
            return (
              <div key={i} className={i > 0 ? "border-t border-border" : ""}>
                <button onClick={() => setOpenFaq(isOpen ? null : i)} className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left">
                  <span className="text-sm font-semibold">{f.q}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && <p className="px-4 pb-4 text-xs text-muted-foreground">{f.a}</p>}
              </div>
            );
          })}
        </div>
      </section>

      {/* Conta */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Conta
        </h2>
        <div className="rounded-2xl border border-border bg-card p-4">
          <Button variant="destructive" onClick={sair} className="w-full sm:w-auto">
            <LogOut className="mr-2 h-4 w-4" /> Sair da conta
          </Button>
        </div>
      </section>
    </div>
  );
}
