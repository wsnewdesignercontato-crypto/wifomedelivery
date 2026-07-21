import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

type Ad = {
  id: string;
  establishment_id: string | null;
  titulo: string;
  subtitulo: string | null;
  imagem_url: string | null;
  banner_path: string | null;
  video_url: string | null;
  destino_url: string | null;
  cta_texto: string | null;
  patrocinado: boolean;
};

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" || parts[0] === "embed") return parts[1] ?? null;
    }
  } catch {
    /* noop */
  }
  return null;
}

export function AdRotator({
  className,
  height = "h-44 sm:h-56",
  fallback,
}: {
  className?: string;
  height?: string;
  fallback?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const prefersReducedMotion = usePrefersReducedMotion();

  const { data: ads = [] } = useQuery({
    queryKey: ["ad_rotator"],
    queryFn: async (): Promise<Ad[]> => {
      const { data, error } = await supabase
        .from("sponsored_ads")
        .select("id, establishment_id, titulo, subtitulo, imagem_url, banner_path, video_url, destino_url, cta_texto, patrocinado")
        .order("prioridade", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Ad[];
    },
  });

  const { data: seconds = 8 } = useQuery({
    queryKey: ["ad_default_seconds"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings").select("ad_default_seconds").eq("id", 1).single();
      return (data as { ad_default_seconds?: number } | null)?.ad_default_seconds ?? 8;
    },
  });

  const [signed, setSigned] = useState<Record<string, string>>({});
  useEffect(() => {
    const missing = ads.filter((a) => a.banner_path && !signed[a.id]);
    if (missing.length === 0) return;
    (async () => {
      const next: Record<string, string> = {};
      for (const a of missing) {
        const { data } = await supabase.storage.from("ad-banners").createSignedUrl(a.banner_path!, 60 * 60);
        if (data?.signedUrl) next[a.id] = data.signedUrl;
      }
      if (Object.keys(next).length) setSigned((s) => ({ ...s, ...next }));
    })();
  }, [ads, signed]);

  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (ads.length <= 1 || prefersReducedMotion) return;
    const t = setTimeout(() => setIdx((i) => (i + 1) % ads.length), Math.max(3, seconds) * 1000);
    return () => clearTimeout(t);
  }, [idx, ads, seconds, prefersReducedMotion]);

  if (ads.length === 0) return fallback ? <>{fallback}</> : null;

  const ad = ads[idx % ads.length];
  const ytId = ad.video_url ? extractYouTubeId(ad.video_url) : null;
  const imgUrl = ad.banner_path ? signed[ad.id] : ad.imagem_url;

  function open() {
    if (ad.destino_url) {
      try {
        const u = new URL(ad.destino_url);
        if (u.origin === window.location.origin) navigate({ to: u.pathname + u.search + u.hash });
        else window.open(ad.destino_url, "_blank", "noopener,noreferrer");
      } catch {
        window.open(ad.destino_url, "_blank", "noopener,noreferrer");
      }
    } else if (ad.establishment_id) {
      navigate({ to: "/cliente/estabelecimento/$id", params: { id: ad.establishment_id } });
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      className={cn(
        "group relative block w-full overflow-hidden rounded-2xl bg-muted text-left shadow-md ring-1 ring-black/5",
        height,
        className,
      )}
    >
      {ytId ? (
        <iframe
          key={ad.id + "-yt"}
          src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${ytId}&modestbranding=1&rel=0&playsinline=1&disablekb=1&iv_load_policy=3`}
          title={ad.titulo}
          allow="autoplay; encrypted-media; picture-in-picture"
          className="pointer-events-none absolute inset-0 h-full w-full scale-[1.4] border-0"
        />
      ) : imgUrl ? (
        <img
          key={ad.id + "-img"}
          src={imgUrl}
          alt={ad.titulo}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-black/60" />
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
      {ad.patrocinado && (
        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur">
          Patrocinado
        </span>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 space-y-2 p-4 text-white">
        <h3 className="text-lg font-bold leading-tight sm:text-xl">{ad.titulo}</h3>
        {ad.subtitulo && <p className="text-xs opacity-90 sm:text-sm">{ad.subtitulo}</p>}
        {(ad.cta_texto || ad.destino_url || ad.establishment_id) && (
          <div className="pt-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
              {ad.cta_texto || "Ver oferta"}
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </div>
        )}
      </div>
      {ads.length > 1 && (
        <div className="pointer-events-none absolute bottom-2 right-3 flex gap-1">
          {ads.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === idx % ads.length ? "w-5 bg-white" : "w-1.5 bg-white/50",
              )}
            />
          ))}
        </div>
      )}
    </button>
  );
}
