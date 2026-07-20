import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ShoppingBag, Store, ChevronRight } from "lucide-react";
import adBurgerPremium from "@/assets/ad-burger-premium.jpg";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cliente/novidades")({
  component: NovidadesPage,
});

type Ad = {
  id: string;
  establishment_id: string | null;
  titulo: string;
  subtitulo: string | null;
  imagem_url: string;
  cta_texto: string;
  duracao_segundos: number;
  patrocinado: boolean;
};

type Novo = {
  id: string;
  nome: string;
  logo_url: string | null;
  capa_url: string | null;
  avaliacao: number | null;
  tempo_medio_min: number | null;
  created_at: string | null;
};

async function fetchAds(): Promise<Ad[]> {
  const { data, error } = await supabase
    .from("sponsored_ads")
    .select("id, establishment_id, titulo, subtitulo, imagem_url, cta_texto, duracao_segundos, patrocinado")
    .order("prioridade", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Ad[];
}

async function fetchNovos(): Promise<Novo[]> {
  const { data, error } = await supabase
    .from("establishments_public")
    .select("id, nome, logo_url, capa_url, avaliacao, tempo_medio_min, created_at")
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) throw error;
  return (data ?? []).filter((e): e is Novo => !!e.id && !!e.nome);
}

function NovidadesPage() {
  const navigate = useNavigate();
  const { data: ads = [], isLoading: loadingAds } = useQuery({ queryKey: ["sponsored_ads"], queryFn: fetchAds });
  const { data: novos = [], isLoading: loadingNovos } = useQuery({ queryKey: ["novos_estabelecimentos"], queryFn: fetchNovos });

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (ads.length <= 1) return;
    const current = ads[idx % ads.length];
    const seconds = Math.max(3, current?.duracao_segundos ?? 6);
    const t = setTimeout(() => setIdx((i) => (i + 1) % ads.length), seconds * 1000);
    return () => clearTimeout(t);
  }, [idx, ads]);

  const currentAd = ads.length ? ads[idx % ads.length] : null;

  function openAd(ad: Ad) {
    if (ad.establishment_id) navigate({ to: "/cliente/estabelecimento/$id", params: { id: ad.establishment_id } });
  }

  return (
    <div className="space-y-6 pb-4">
      <div className="flex items-center gap-2">
        <ShoppingBag className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Novidades</h1>
      </div>

      {/* Banner rotativo de anúncios patrocinados */}
      <section>
        {loadingAds ? (
          <Skeleton className="h-44 w-full rounded-2xl" />
        ) : currentAd ? (
          <button
            onClick={() => openAd(currentAd)}
            className="group relative block h-44 w-full overflow-hidden rounded-2xl bg-muted text-left shadow-md ring-1 ring-black/5 sm:h-56"
          >
            <img
              key={currentAd.id}
              src={currentAd.imagem_url}
              alt={currentAd.titulo}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
            {currentAd.patrocinado && (
              <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur">
                Patrocinado
              </span>
            )}
            <div className="absolute inset-x-0 bottom-0 space-y-2 p-4 text-white">
              <h3 className="text-lg font-bold leading-tight sm:text-xl">{currentAd.titulo}</h3>
              {currentAd.subtitulo && <p className="text-xs opacity-90 sm:text-sm">{currentAd.subtitulo}</p>}
              <div className="pt-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
                  {currentAd.cta_texto}
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
            {ads.length > 1 && (
              <div className="absolute bottom-2 right-3 flex gap-1">
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
        ) : (
          <div className="group relative block h-44 w-full overflow-hidden rounded-2xl text-left shadow-xl ring-1 ring-black/10 sm:h-56">
            <img
              src={adBurgerPremium}
              alt="Burger Master - Combo em promoção"
              width={1536}
              height={1024}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
            {/* Degradê para leitura do texto à esquerda */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

            {/* Tag "Anúncio" no canto superior esquerdo */}
            <span className="absolute left-3 top-3 rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/90 backdrop-blur">
              Anúncio
            </span>

            {/* Conteúdo do banner */}
            <div className="absolute inset-y-0 left-0 flex max-w-[65%] flex-col justify-center gap-2 p-5 text-white sm:max-w-[55%] sm:p-6">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary sm:text-xs">
                Burger Master
              </span>
              <h3 className="text-xl font-extrabold leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] sm:text-2xl">
                Combo Duplo por <span className="text-primary">R$ 29,90</span>
              </h3>
              <p className="text-xs opacity-90 sm:text-sm">
                Hambúrguer artesanal + batata + refri. Só hoje!
              </p>
              <div className="pt-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/40">
                  Peça agora
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Novos estabelecimentos */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Novos estabelecimentos</h2>
          <Store className="h-4 w-4 text-muted-foreground" />
        </div>

        {loadingNovos ? (
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
        ) : novos.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhum estabelecimento novo por aqui ainda.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {novos.map((e) => (
              <button
                key={e.id}
                onClick={() => navigate({ to: "/cliente/estabelecimento/$id", params: { id: e.id } })}
                className="group flex flex-col overflow-hidden rounded-2xl bg-card text-left shadow-sm ring-1 ring-border transition hover:shadow-md"
              >
                <div className="relative h-24 w-full bg-muted">
                  {e.capa_url || e.logo_url ? (
                    <img src={e.capa_url ?? e.logo_url ?? ""} alt={e.nome} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <Store className="h-6 w-6" />
                    </div>
                  )}
                  <span className="absolute left-2 top-2 rounded-full bg-primary/95 px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
                    Novo
                  </span>
                </div>
                <div className="space-y-1 p-3">
                  <p className="line-clamp-1 text-sm font-semibold">{e.nome}</p>
                  <div className="flex items-center gap-2 pt-0.5 text-[11px] text-muted-foreground">
                    {e.avaliacao != null && <span>★ {Number(e.avaliacao).toFixed(1)}</span>}
                    {e.tempo_medio_min != null && <span>{e.tempo_medio_min} min</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {ads.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-bold">Ofertas patrocinadas</h2>
          <div className="grid grid-cols-1 gap-3">
            {ads.map((ad) => (
              <button
                key={ad.id}
                onClick={() => openAd(ad)}
                className="group flex items-center gap-3 overflow-hidden rounded-2xl bg-card p-3 text-left shadow-sm ring-1 ring-border transition hover:shadow-md"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                  <img src={ad.imagem_url} alt={ad.titulo} className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-semibold">{ad.titulo}</p>
                  {ad.subtitulo && <p className="line-clamp-1 text-xs text-muted-foreground">{ad.subtitulo}</p>}
                  <span className="mt-1 inline-block text-[10px] font-semibold uppercase tracking-wider text-primary">
                    Patrocinado
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="pt-2 text-center">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/cliente/buscar" })}>
          Buscar restaurantes e pratos
        </Button>
      </div>
    </div>
  );
}
