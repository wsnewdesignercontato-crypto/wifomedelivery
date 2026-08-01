import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { IFomeLogo } from "@/components/ifome-logo";
import { Button } from "@/components/ui/button";

import promoFoodHero from "@/assets/promo-food-hero.jpg";

export type PromoAudience = "cliente" | "estabelecimento" | "entregador";

export const PROMO_ART: Record<PromoAudience, string> = {
  cliente: promoFoodHero,
  estabelecimento: promoFoodHero,
  entregador: promoFoodHero,
};

export const PROMO_LABEL: Record<PromoAudience, string> = {
  cliente: "Oferta WiFome",
  estabelecimento: "Novidade para parceiros",
  entregador: "Aviso para entregadores",
};

type BannerData = {
  titulo?: string;
  subtitulo?: string;
  imagem_url?: string;
  cta_texto?: string;
  cta_link?: string;
  cor?: string;
};

type PromoNotif = {
  id: string;
  titulo: string;
  mensagem: string;
  link_url: string | null;
  banner: BannerData | null;
};

/**
 * Banner promocional em tela cheia, exibido apenas dentro do app do público
 * correspondente (cliente, estabelecimento ou entregador).
 */
export function PromoAnnouncement({ audience }: { audience: PromoAudience }) {
  const [notif, setNotif] = useState<PromoNotif | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from("notifications")
        .select("id,titulo,mensagem,link_url,banner,audience")
        .eq("user_id", auth.user.id)
        .eq("tipo", "promo")
        .eq("lida", false)
        .or(`audience.eq.${audience},audience.is.null`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active || !data) return;
      setNotif(data as unknown as PromoNotif);
    })();
    return () => {
      active = false;
    };
  }, [audience]);

  if (!notif) return null;

  const b = notif.banner ?? {};
  const cor = b.cor || "#FF6B00";
  const titulo = b.titulo || notif.titulo;
  const subtitulo = b.subtitulo || notif.mensagem;
  const ctaTexto = b.cta_texto || "Aproveitar";
  const ctaLink = b.cta_link || notif.link_url;
  const arte = b.imagem_url || promoFoodHero;

  async function dismiss(go?: string | null) {
    const id = notif!.id;
    setNotif(null);
    await supabase.from("notifications").update({ lida: true }).eq("id", id);
    if (go) {
      if (go.startsWith("http")) window.location.href = go;
      else void navigate({ to: go } as never);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-[2rem] border border-white/10 bg-[#0c0705] shadow-2xl animate-in zoom-in-95 duration-300"
      >
        {/* Hero de comida no topo */}
        <div className="relative h-56 w-full sm:h-64">
          <img
            src={arte}
            alt={titulo}
            width={1152}
            height={576}
            loading="eager"
            className="h-full w-full object-cover"
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(12,7,5,0) 0%, rgba(12,7,5,0.35) 45%, rgba(12,7,5,0.85) 78%, #0c0705 100%)",
            }}
          />
        </div>

        {/* Botão fechar */}
        <button
          onClick={() => dismiss()}
          aria-label="Fechar aviso"
          className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-2 text-white/90 transition hover:bg-black/80 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Conteúdo centralizado */}
        <div className="relative -mt-10 px-6 pb-7 pt-2 text-center">
          <div className="mb-3 flex justify-center">
            <IFomeLogo size="md" showWord={false} />
          </div>

          <span
            className="inline-flex items-center rounded-full px-3.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
            style={{ backgroundColor: `${cor}25`, border: `1.5px solid ${cor}` }}
          >
            {PROMO_LABEL[audience]}
          </span>

          <h2 className="mt-3 text-3xl font-black leading-tight text-white">{titulo}</h2>
          <p className="mt-1.5 text-sm font-medium text-white/70">{subtitulo}</p>

          <Button
            onClick={() => dismiss(ctaLink)}
            className="mt-6 h-12 w-full rounded-xl text-base font-bold shadow-lg"
            style={{ backgroundColor: cor, color: "#fff", boxShadow: `0 10px 25px -8px ${cor}66` }}
          >
            {ctaTexto}
          </Button>

          <button
            onClick={() => dismiss()}
            className="mt-3 w-full text-xs font-semibold text-white/50 transition hover:text-white/90"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}
