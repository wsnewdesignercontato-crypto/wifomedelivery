import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { IFomeLogo } from "@/components/ifome-logo";
import { Button } from "@/components/ui/button";

import artCliente from "@/assets/promo-cliente.jpg";
import artEstab from "@/assets/promo-estabelecimento.jpg";
import artEntregador from "@/assets/promo-entregador.jpg";

export type PromoAudience = "cliente" | "estabelecimento" | "entregador";

export const PROMO_ART: Record<PromoAudience, string> = {
  cliente: artCliente,
  estabelecimento: artEstab,
  entregador: artEntregador,
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
  const ctaTexto = b.cta_texto || "Aproveitar agora";
  const ctaLink = b.cta_link || notif.link_url;
  const arte = b.imagem_url || PROMO_ART[audience];

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
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 shadow-2xl animate-in zoom-in-95 duration-300"
        style={{ background: "linear-gradient(180deg, #1a0d05 0%, #0c0705 100%)" }}
      >
        <button
          onClick={() => dismiss()}
          aria-label="Fechar aviso"
          className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-2 text-white/80 transition hover:bg-black/70 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative">
          <img
            src={arte}
            alt={titulo}
            width={1152}
            height={576}
            loading="lazy"
            className="h-48 w-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(12,7,5,0) 35%, rgba(12,7,5,0.75) 78%, #1a0d05 100%)",
            }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${cor}, transparent)` }}
          />
        </div>

        <div className="relative px-6 pb-6 pt-5 text-center">
          <div
            className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-40 w-40 rounded-full opacity-40 blur-3xl"
            style={{ backgroundColor: cor }}
          />
          <div className="relative">
            <div className="mb-3 flex justify-center">
              <IFomeLogo size="md" showWord={false} />
            </div>

            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
              style={{ backgroundColor: `${cor}2e`, border: `1px solid ${cor}` }}
            >
              {PROMO_LABEL[audience]}
            </span>

            <h2 className="mt-3 text-2xl font-black leading-tight text-white">{titulo}</h2>
            <p className="mt-2 text-sm text-white/75">{subtitulo}</p>

            <Button
              onClick={() => dismiss(ctaLink)}
              className="mt-6 h-12 w-full rounded-xl text-base font-bold"
              style={{ backgroundColor: cor, color: "#fff" }}
            >
              {ctaTexto}
            </Button>

            <button
              onClick={() => dismiss()}
              className="mt-3 w-full text-xs font-medium text-white/55 transition hover:text-white"
            >
              Agora não
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
