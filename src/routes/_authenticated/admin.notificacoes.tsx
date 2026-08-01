import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Send, Sparkles, Users, Store, Bike, Megaphone, Image as ImageIcon } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { IFomeLogo } from "@/components/ifome-logo";

export const Route = createFileRoute("/_authenticated/admin/notificacoes")({
  component: NotificacoesPage,
});

type Audience = "cliente" | "estabelecimento" | "entregador";

type Banner = {
  titulo?: string;
  subtitulo?: string;
  imagem_url?: string;
  cta_texto?: string;
  cta_link?: string;
  cor?: string;
};

type Template = {
  id: string;
  audience: Audience;
  nome: string;
  categoria: string;
  titulo: string;
  mensagem: string;
  link_url: string | null;
  tipo: string;
  banner: Banner | null;
};

type Notif = {
  id: string;
  titulo: string;
  mensagem: string;
  audience: string | null;
  tipo: string | null;
  created_at: string;
};

const AUDIENCES: { key: Audience; label: string; icon: typeof Users; desc: string }[] = [
  { key: "cliente", label: "Clientes", icon: Users, desc: "Mensagens para quem faz pedidos" },
  { key: "estabelecimento", label: "Estabelecimentos", icon: Store, desc: "Mensagens para as lojas parceiras" },
  { key: "entregador", label: "Entregadores", icon: Bike, desc: "Mensagens para os motoristas" },
];

const EMPTY_BANNER: Banner = {
  titulo: "",
  subtitulo: "",
  imagem_url: "",
  cta_texto: "Aproveitar agora",
  cta_link: "",
  cor: "#FF6B00",
};

async function fetchTemplates() {
  const { data, error } = await supabase
    .from("notification_templates")
    .select("*")
    .eq("ativo", true)
    .order("audience")
    .order("categoria");
  if (error) throw error;
  return (data ?? []) as unknown as Template[];
}

async function fetchNotifs() {
  const { data, error } = await supabase
    .from("notifications")
    .select("id,titulo,mensagem,audience,tipo,created_at")
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) throw error;
  return (data ?? []) as Notif[];
}

async function fetchUserIds(role: Audience) {
  const { data } = await supabase.from("user_roles").select("user_id").eq("role", role);
  return (data ?? []).map((r) => r.user_id as string);
}

function NotificacoesPage() {
  const [tab, setTab] = useState<Audience>("cliente");
  const { data: templates = [] } = useQuery({ queryKey: ["notif-templates"], queryFn: fetchTemplates });
  const { data: history = [], isLoading } = useQuery({ queryKey: ["notifs"], queryFn: fetchNotifs });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Notificações & Campanhas</h1>
        <p className="text-sm text-muted-foreground">
          Modelos prontos e envio em massa, separados por público. Mensagens de promoção exibem um banner
          em tela cheia quando o usuário entra no app.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Audience)}>
        <TabsList className="grid w-full grid-cols-3">
          {AUDIENCES.map((a) => (
            <TabsTrigger key={a.key} value={a.key} className="gap-2">
              <a.icon className="h-4 w-4" />
              {a.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {AUDIENCES.map((a) => (
          <TabsContent key={a.key} value={a.key} className="mt-5">
            <AudiencePanel audience={a.key} label={a.label} desc={a.desc} templates={templates.filter((t) => t.audience === a.key)} />
          </TabsContent>
        ))}
      </Tabs>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4 text-sm font-semibold">Histórico de envios</div>
        <div className="max-h-[420px] overflow-y-auto">
          {isLoading && <p className="p-6 text-center text-muted-foreground">Carregando…</p>}
          {!isLoading && history.length === 0 && (
            <p className="p-6 text-center text-muted-foreground">Nenhuma notificação enviada.</p>
          )}
          {history.map((n) => (
            <div key={n.id} className="border-b border-border/50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{n.titulo}</p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{n.mensagem}</p>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {new Date(n.created_at).toLocaleString("pt-BR")}
                </span>
              </div>
              <div className="mt-2 flex gap-2">
                {n.audience && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">{n.audience}</span>
                )}
                {n.tipo === "promo" && (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-500">
                    banner promocional
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AudiencePanel({
  audience,
  label,
  desc,
  templates,
}: {
  audience: Audience;
  label: string;
  desc: string;
  templates: Template[];
}) {
  const qc = useQueryClient();
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [isPromo, setIsPromo] = useState(false);
  const [banner, setBanner] = useState<Banner>(EMPTY_BANNER);
  const [sending, setSending] = useState(false);

  const grupos = useMemo(() => {
    const map = new Map<string, Template[]>();
    templates.forEach((t) => map.set(t.categoria, [...(map.get(t.categoria) ?? []), t]));
    return [...map.entries()];
  }, [templates]);

  function applyTemplate(t: Template) {
    setTitulo(t.titulo);
    setMensagem(t.mensagem);
    setLinkUrl(t.link_url ?? "");
    const promo = t.tipo === "promo";
    setIsPromo(promo);
    setBanner(promo ? { ...EMPTY_BANNER, ...(t.banner ?? {}) } : EMPTY_BANNER);
    toast.success(`Modelo "${t.nome}" carregado`);
  }

  async function send() {
    if (!titulo.trim() || !mensagem.trim()) {
      toast.error("Preencha título e mensagem");
      return;
    }
    setSending(true);
    try {
      const ids = await fetchUserIds(audience);
      if (ids.length === 0) {
        toast.error("Nenhum destinatário encontrado");
        return;
      }
      const payloadBanner = isPromo
        ? {
            titulo: banner.titulo || titulo,
            subtitulo: banner.subtitulo || mensagem,
            imagem_url: banner.imagem_url || null,
            cta_texto: banner.cta_texto || "Aproveitar agora",
            cta_link: banner.cta_link || linkUrl || null,
            cor: banner.cor || "#FF6B00",
          }
        : null;

      const rows = ids.map((uid) => ({
        user_id: uid,
        audience,
        titulo,
        mensagem,
        link_url: linkUrl || null,
        tipo: isPromo ? "promo" : "info",
        banner: payloadBanner,
      }));

      const { error } = await supabase.from("notifications").insert(rows);
      if (error) throw error;
      toast.success(`Enviado para ${ids.length} ${label.toLowerCase()}`);
      setTitulo("");
      setMensagem("");
      setLinkUrl("");
      setIsPromo(false);
      setBanner(EMPTY_BANNER);
      qc.invalidateQueries({ queryKey: ["notifs"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Modelos prontos — {label}</h3>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">{desc}</p>
          <div className="space-y-4">
            {grupos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum modelo cadastrado.</p>}
            {grupos.map(([cat, list]) => (
              <div key={cat}>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{cat}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {list.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => applyTemplate(t)}
                      className="rounded-lg border border-border bg-background p-3 text-left transition hover:border-primary hover:shadow-sm"
                    >
                      <p className="flex items-center gap-1.5 text-sm font-semibold">
                        {t.tipo === "promo" && <Megaphone className="h-3.5 w-3.5 text-primary" />}
                        {t.nome}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.titulo}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 font-semibold">Mensagem</h3>
          <div className="space-y-3">
            <div>
              <Label>Título</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div>
              <Label>Mensagem</Label>
              <Textarea rows={3} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
            </div>
            <div>
              <Label>Link ao tocar (opcional)</Label>
              <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder={`/${audience}`} />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Exibir banner ao abrir o app</p>
                <p className="text-xs text-muted-foreground">Ideal para promoções e descontos</p>
              </div>
              <Switch checked={isPromo} onCheckedChange={setIsPromo} />
            </div>

            {isPromo && (
              <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div>
                  <Label>Título do banner</Label>
                  <Input value={banner.titulo ?? ""} onChange={(e) => setBanner({ ...banner, titulo: e.target.value })} />
                </div>
                <div>
                  <Label>Subtítulo</Label>
                  <Input value={banner.subtitulo ?? ""} onChange={(e) => setBanner({ ...banner, subtitulo: e.target.value })} />
                </div>
                <div>
                  <Label className="flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5" /> Imagem (URL, opcional)
                  </Label>
                  <Input value={banner.imagem_url ?? ""} onChange={(e) => setBanner({ ...banner, imagem_url: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Texto do botão</Label>
                    <Input value={banner.cta_texto ?? ""} onChange={(e) => setBanner({ ...banner, cta_texto: e.target.value })} />
                  </div>
                  <div>
                    <Label>Cor</Label>
                    <Input type="color" value={banner.cor ?? "#FF6B00"} onChange={(e) => setBanner({ ...banner, cor: e.target.value })} className="h-10 p-1" />
                  </div>
                </div>
                <div>
                  <Label>Link do botão</Label>
                  <Input value={banner.cta_link ?? ""} onChange={(e) => setBanner({ ...banner, cta_link: e.target.value })} placeholder={`/${audience}`} />
                </div>
              </div>
            )}

            <Button onClick={send} disabled={sending} className="w-full">
              <Send className="mr-2 h-4 w-4" />
              {sending ? "Enviando…" : `Enviar para ${label.toLowerCase()}`}
            </Button>
          </div>
        </div>
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <p className="mb-3 text-sm font-semibold">Pré-visualização</p>
        <BannerPreview
          promo={isPromo}
          titulo={titulo}
          mensagem={mensagem}
          banner={banner}
          audience={audience as PromoAudience}
        />

      </div>
    </div>
  );
}

function BannerPreview({ promo, titulo, mensagem, banner, audience }: { promo: boolean; titulo: string; mensagem: string; banner: Banner; audience: PromoAudience }) {
  if (!promo) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">{titulo || "Título da notificação"}</p>
        <p className="mt-1 text-sm text-muted-foreground">{mensagem || "Texto da mensagem aparece aqui."}</p>
        <p className="mt-3 text-xs text-muted-foreground">Aparece no sino e como push no celular.</p>
      </div>
    );
  }
  const cor = banner.cor || "#FF6B00";
  const arte = banner.imagem_url || PROMO_ART[audience] || PROMO_ART.cliente;
  return (
    <div
      className="mx-auto w-full max-w-[320px] overflow-hidden rounded-3xl border border-white/10 shadow-2xl"
      style={{ background: "linear-gradient(180deg, #1a0d05 0%, #0c0705 100%)" }}
    >
      <div className="relative">
        <img src={arte} alt="" className="h-40 w-full object-cover" loading="lazy" />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(180deg, rgba(12,7,5,0) 35%, rgba(12,7,5,0.75) 78%, #1a0d05 100%)" }}
        />
      </div>
      <div className="px-6 pb-6 pt-5 text-center">
        <div className="mb-3 flex justify-center">
          <IFomeLogo size="md" showWord={false} />
        </div>
        <span
          className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
          style={{ backgroundColor: `${cor}2e`, border: `1px solid ${cor}` }}
        >
          {PROMO_LABEL[audience] || PROMO_LABEL.cliente}
        </span>
        <h2 className="mt-3 text-2xl font-black leading-tight text-white">{banner.titulo || titulo || "Sua oferta aqui"}</h2>
        <p className="mt-2 text-sm text-white/75">{banner.subtitulo || mensagem || "Descrição da promoção"}</p>
        <div
          className="mt-6 flex h-12 w-full items-center justify-center rounded-xl text-base font-bold text-white"
          style={{ backgroundColor: cor }}
        >
          {banner.cta_texto || "Aproveitar agora"}
        </div>
        <p className="mt-3 text-xs text-white/55">Agora não</p>
      </div>
    </div>
  );
}

