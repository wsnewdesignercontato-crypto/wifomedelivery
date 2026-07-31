import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X, Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { IFomeLogo } from "@/components/ifome-logo";
import { Button } from "@/components/ui/button";

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
 * Exibe um banner promocional em tela cheia quando o usuário entra no app
 * e existe uma notificação do tipo "promo" ainda não lida.
 */
export function PromoAnnouncement() {
  const [notif, setNotif] = useState<PromoNotif | null>(null);
  const [closing, setClosing] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from("notifications")
        .select("id,titulo,mensagem,link_url,banner")
        .eq("user_id", auth.user.id)
        .eq("tipo", "promo")
        .eq("lida", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active || !data) return;
      setNotif(data as unknown as PromoNotif);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!notif) return null;

  const b = notif.banner ?? {};
  const cor = b.cor || "#FF6B00";
  const titulo = b.titulo || notif.titulo;
  const subtitulo = b.subtitulo || notif.mensagem;
  const ctaTexto = b.cta_texto || "Aproveitar agora";
  const ctaLink = b.cta_link || notif.link_url;

  async function dismiss(go?: string | null) {
    setClosing(true);
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
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        className={`relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 shadow-2xl animate-in zoom-in-95 duration-300 ${
          closing ? "opacity-0" : ""
        }`}
        style={{
          background: `radial-gradient(120% 90% at 50% 0%, ${cor} 0%, #1a0d05 65%, #0c0705 100%)`,
        }}
      >
        <button
          onClick={() => dismiss()}
          aria-label="Fechar aviso"
          className="absolute right-3 top-3 z-10 rounded-full bg-black/40 p-2 text-white/80 transition hover:bg-black/60 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {b.imagem_url ? (
          <img
            src={b.imagem_url}
            alt={titulo}
            className="h-40 w-full object-cover"
            loading="lazy"
          />
        ) : null}

        <div className="px-6 pb-6 pt-7 text-center">
          <div className="mb-4 flex justify-center">
            <IFomeLogo size="md" showWord={false} />
          </div>

          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
            style={{ backgroundColor: "rgba(255,255,255,0.16)" }}
          >
            <Sparkles className="h-3 w-3" /> Oferta WiFome
          </span>

          <h2 className="mt-3 text-2xl font-black leading-tight text-white">{titulo}</h2>
          <p className="mt-2 text-sm text-white/80">{subtitulo}</p>

          <Button
            onClick={() => dismiss(ctaLink)}
            className="mt-6 h-12 w-full rounded-xl text-base font-bold"
            style={{ backgroundColor: cor, color: "#fff" }}
          >
            {ctaTexto}
          </Button>

          <button
            onClick={() => dismiss()}
            className="mt-3 w-full text-xs font-medium text-white/60 transition hover:text-white"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}
