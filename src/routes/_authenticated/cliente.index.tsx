import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Star, ChevronRight, Loader2, Tag, Flame, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import catPizza from "@/assets/cat-pizza.jpg";
import catHamburguer from "@/assets/cat-hamburguer.jpg";
import catSushi from "@/assets/cat-sushi.jpg";
import catAcai from "@/assets/cat-acai.jpg";
import catSorvete from "@/assets/cat-sorvete.jpg";
import catMarmita from "@/assets/cat-marmita.jpg";
import catPastel from "@/assets/cat-pastel.jpg";
import catFrango from "@/assets/cat-frango.jpg";
import catChurrasco from "@/assets/cat-churrasco.jpg";
import catSaudavel from "@/assets/cat-saudavel.jpg";
import catMexicana from "@/assets/cat-mexicana.jpg";
import catMassas from "@/assets/cat-massas.jpg";
import catPadaria from "@/assets/cat-padaria.jpg";
import catLanches from "@/assets/cat-lanches.jpg";
import catDoces from "@/assets/cat-doces.jpg";
import catChocolates from "@/assets/cat-chocolates.jpg";
import catBebidas from "@/assets/cat-bebidas.jpg";
import catCafeteria from "@/assets/cat-cafeteria.jpg";
import catPorcoes from "@/assets/cat-porcoes.jpg";
import catMercado from "@/assets/cat-mercado.jpg";
import catFarmacia from "@/assets/cat-farmacia.jpg";
import bannerFreteGratis from "@/assets/banner-frete-gratis-premium.png.asset.json";
import { AdRotator } from "@/components/cliente/ad-rotator";
import { useCityDetection } from "@/hooks/use-city-detection";
import { CitySwitchCard } from "@/components/cliente/city-switch-card";

export const Route = createFileRoute("/_authenticated/cliente/")({
  component: ClienteHome,
});

type Categoria = { id: string; nome: string; slug: string; icone: string | null };
type Estab = {
  id: string;
  nome: string;
  descricao: string | null;
  categoria_id: string | null;
  logo_url: string | null;
  capa_url: string | null;
  taxa_entrega_cents: number;
  tempo_medio_min: number | null;
  avaliacao: number | null;
  is_open: boolean;
  cidade: string | null;
};

const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Foto real por slug (fallback usa emoji)
const CAT_IMG: Record<string, string> = {
  pizza: catPizza,
  hamburguer: catHamburguer,
  hamburgueres: catHamburguer,
  lanches: catLanches,
  japonesa: catSushi,
  sushi: catSushi,
  acai: catAcai,
  sorvete: catSorvete,
  marmita: catMarmita,
  pastel: catPastel,
  frango: catFrango,
  churrasco: catChurrasco,
  saudavel: catSaudavel,
  mexicana: catMexicana,
  massas: catMassas,
  padaria: catPadaria,
  doces: catDoces,
  chocolates: catChocolates,
  bebidas: catBebidas,
  cafeteria: catCafeteria,
  porcoes: catPorcoes,
  mercado: catMercado,
  farmacia: catFarmacia,
};

function ClienteHome() {
  const navigate = useNavigate();
  const [cats, setCats] = useState<Categoria[]>([]);
  const [estabs, setEstabs] = useState<Estab[]>([]);
  const [catSel, setCatSel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllCats, setShowAllCats] = useState(false);
  const [promoIds, setPromoIds] = useState<Set<string>>(new Set());
  const [salesCount, setSalesCount] = useState<Record<string, number>>({});
  const [threshold, setThreshold] = useState<number>(15);
  const [hoursById, setHoursById] = useState<Record<string, { abre: string; fecha: string }>>({});
  const [reviewCountById, setReviewCountById] = useState<Record<string, number>>({});
  const [sortBy, setSortBy] = useState<"recomendados" | "reviews" | "vendas">("recomendados");
  const [activeCidade, setActiveCidade] = useState<string | null>(null);
  const [activeEstado, setActiveEstado] = useState<string | null>(null);
  const catsScrollRef = useRef<HTMLDivElement | null>(null);
  const catsPausedRef = useRef(false);
  const { detected, dismiss } = useCityDetection(activeCidade, activeEstado);

  // Carrega cidade ativa do perfil
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;
      const { data } = await supabase
        .from("profiles")
        .select("cidade_ativa,estado_ativo")
        .eq("id", auth.user.id)
        .maybeSingle();
      setActiveCidade((data as any)?.cidade_ativa ?? null);
      setActiveEstado((data as any)?.estado_ativo ?? null);
    })();
  }, []);

  // Auto-scroll lento das categorias — pausa ao interagir, ao selecionar,
  // ao expandir em grade, ao trocar de aba e para reduced-motion.
  useEffect(() => {
    const el = catsScrollRef.current;
    if (!el) return;
    if (showAllCats) return; // no modo grade não há scroll horizontal
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let last = performance.now();
    let pos = el.scrollLeft;
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;
    const SPEED = 84; // px/s — roda as categorias de forma visível e fluida

    const pause = (ms = 2500) => {
      catsPausedRef.current = true;
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => { catsPausedRef.current = false; }, ms);
    };

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const max = el.scrollWidth - el.clientWidth;
      if (!catsPausedRef.current && !document.hidden && max > 4) {
        // Sincroniza acumulador quando o usuário rolou manualmente
        if (Math.abs(pos - el.scrollLeft) > 2) pos = el.scrollLeft;
        pos += SPEED * dt;
        if (pos >= max - 0.5) pos = 0;
        el.scrollLeft = pos;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    const onEnter = () => { catsPausedRef.current = true; };
    const onLeave = () => { catsPausedRef.current = false; };
    const onInteract = () => pause(3000);
    const onVisibility = () => { last = performance.now(); };

    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);
    el.addEventListener("pointerdown", onInteract);
    el.addEventListener("touchstart", onInteract, { passive: true });
    el.addEventListener("wheel", onInteract, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      if (resumeTimer) clearTimeout(resumeTimer);
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
      el.removeEventListener("pointerdown", onInteract);
      el.removeEventListener("touchstart", onInteract);
      el.removeEventListener("wheel", onInteract);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [cats.length, showAllCats]);

  // Pausa longa quando o usuário seleciona uma categoria (mantém a escolha visível)
  useEffect(() => {
    if (!catSel) return;
    catsPausedRef.current = true;
    const t = setTimeout(() => { catsPausedRef.current = false; }, 5000);
    return () => clearTimeout(t);
  }, [catSel]);

  useEffect(() => {
    (async () => {
      const nowIso = new Date().toISOString();
      let estabQ = supabase
        .from("establishments")
        .select("id,nome,descricao,categoria_id,logo_url,capa_url,taxa_entrega_cents,tempo_medio_min,avaliacao,is_open,cidade")
        .eq("status", "aprovado")
        .eq("is_open", true);
      if (activeCidade) estabQ = estabQ.ilike("cidade", activeCidade);
      const [c, e, cp, od, ps] = await Promise.all([
        supabase.from("global_categories").select("id,nome,slug,icone").eq("ativo", true).order("ordem"),
        estabQ.order("avaliacao", { ascending: false, nullsFirst: false }),
        supabase
          .from("coupons")
          .select("establishment_id,expires_at,ativo")
          .eq("ativo", true),
        supabase
          .from("orders")
          .select("establishment_id")
          .eq("status", "delivered"),
        (supabase as any).from("public_platform_settings").select("bestseller_threshold, ad_default_seconds").maybeSingle(),
      ]);
      setCats((c.data ?? []) as Categoria[]);
      setEstabs((e.data ?? []) as Estab[]);
      const promos = new Set<string>();
      (cp.data ?? []).forEach((r: any) => {
        if (r.establishment_id && (!r.expires_at || r.expires_at > nowIso)) promos.add(r.establishment_id);
      });
      setPromoIds(promos);
      const counts: Record<string, number> = {};
      (od.data ?? []).forEach((r: any) => {
        if (r.establishment_id) counts[r.establishment_id] = (counts[r.establishment_id] ?? 0) + 1;
      });
      setSalesCount(counts);
      if ((ps as any).data?.bestseller_threshold) setThreshold((ps as any).data.bestseller_threshold);

      // Horário de hoje para as lojas listadas
      const ids = (e.data ?? []).map((x: any) => x.id);
      if (ids.length) {
        const today = new Date().getDay();
        const { data: hrs } = await supabase
          .from("establishment_hours")
          .select("establishment_id,abre,fecha,ativo,dia_semana")
          .in("establishment_id", ids)
          .eq("dia_semana", today)
          .eq("ativo", true);
        const map: Record<string, { abre: string; fecha: string }> = {};
        (hrs ?? []).forEach((h: any) => {
          map[h.establishment_id] = { abre: String(h.abre).slice(0, 5), fecha: String(h.fecha).slice(0, 5) };
        });
        setHoursById(map);

        const { data: revs } = await supabase
          .from("public_reviews")
          .select("establishment_id")
          .in("establishment_id", ids);
        const rc: Record<string, number> = {};
        (revs ?? []).forEach((r: any) => {
          if (r.establishment_id) rc[r.establishment_id] = (rc[r.establishment_id] ?? 0) + 1;
        });
        setReviewCountById(rc);
      }


      setLoading(false);
    })();
  }, [activeCidade]);

  const filtered = useMemo(() => {
    const base = catSel ? estabs.filter((e) => e.categoria_id === catSel) : estabs;
    const arr = [...base];
    if (sortBy === "reviews") {
      arr.sort((a, b) =>
        ((reviewCountById[b.id] ?? 0) - (reviewCountById[a.id] ?? 0)) ||
        (Number(b.avaliacao ?? 0) - Number(a.avaliacao ?? 0)) ||
        ((salesCount[b.id] ?? 0) - (salesCount[a.id] ?? 0))
      );
    } else if (sortBy === "vendas") {
      arr.sort((a, b) =>
        ((salesCount[b.id] ?? 0) - (salesCount[a.id] ?? 0)) ||
        (Number(b.avaliacao ?? 0) - Number(a.avaliacao ?? 0)) ||
        ((reviewCountById[b.id] ?? 0) - (reviewCountById[a.id] ?? 0))
      );
    } else {
      // Recomendados: score ponderado (nota + volume avaliações + vendas + promo)
      const score = (e: Estab) => {
        const rating = Number(e.avaliacao ?? 0);
        const revs = reviewCountById[e.id] ?? 0;
        const sales = salesCount[e.id] ?? 0;
        const promo = promoIds.has(e.id) ? 1 : 0;
        return rating * 2 + Math.log10(revs + 1) * 3 + Math.log10(sales + 1) * 2 + promo * 0.5;
      };
      arr.sort((a, b) => score(b) - score(a));
    }
    return arr;
  }, [estabs, catSel, sortBy, reviewCountById, salesCount, promoIds]);

  const compactCount = cats.length;
  const visibleCats = cats;

  return (
    <div className="space-y-6">
      {detected && detected.differsFromActive && (
        <CitySwitchCard
          cidade={detected.cidade}
          estado={detected.estado}
          hasEstabs={detected.hasEstabsHere}
          onAccept={async () => {
            await supabase.rpc("set_active_city", {
              _cidade: detected.cidade,
              _estado: detected.estado,
            });
            setActiveCidade(detected.cidade);
            setActiveEstado(detected.estado);
            dismiss();
          }}
          onDismiss={dismiss}
        />
      )}
      {/* Banner único: anúncios patrocinados (rotativo) com fallback de frete grátis */}
      <AdRotator
        fallback={
          <button
            onClick={() => navigate({ to: "/cliente/buscar" })}
            className="relative block w-full overflow-hidden rounded-2xl text-left shadow-brand"
          >
            <img
              src={bannerFreteGratis.url}
              alt="Frete grátis nas suas primeiras 3 entregas"
              width={1200}
              height={600}
              loading="lazy"
              className="h-40 w-full object-cover sm:h-48 md:h-56"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
            <div className="absolute inset-0 flex flex-col justify-center p-5">
              <p className="text-2xl font-black leading-tight text-white drop-shadow-lg sm:text-3xl">Frete grátis</p>
              <p className="mt-1 text-sm font-medium text-white/90 drop-shadow-md">nas suas primeiras</p>
              <p className="text-2xl font-black leading-tight text-primary drop-shadow-lg sm:text-3xl">3 entregas</p>
            </div>
          </button>
        }
      />

      {/* Categorias — rail horizontal compacto, expande em grade ao ver todas */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-foreground">Categorias</h2>
          {!showAllCats && (
            <button onClick={() => setShowAllCats(true)} className="text-xs font-bold text-primary">
              Ver todas
            </button>
          )}
        </div>
        <div
          ref={catsScrollRef}
          className={
            showAllCats
              ? "grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8"
              : "flex gap-3 overflow-x-auto scrollbar-hide pb-2"
          }
        >
          {visibleCats.map((c) => {
            const img = CAT_IMG[c.slug];
            const active = catSel === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setCatSel(active ? null : c.id)}
                className={`flex flex-col items-center gap-1.5 ${showAllCats ? "" : "shrink-0"}`}
              >
                <div
                  className={`aspect-square overflow-hidden rounded-2xl bg-muted shadow-sm transition-all ${
                    showAllCats ? "w-full" : "h-16 w-16 sm:h-[72px] sm:w-[72px]"
                  } ${
                    active ? "ring-2 ring-primary ring-offset-2 scale-[1.03]" : "hover:scale-[1.03]"
                  }`}
                >
                  {img ? (
                    <img
                      src={img}
                      alt={c.nome}
                      width={192}
                      height={192}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-gradient-to-br from-primary/15 to-primary/5 text-2xl">
                      🍽️
                    </div>
                  )}
                </div>
                <span
                  className={`text-center text-[11px] font-semibold leading-tight sm:text-xs ${
                    active ? "text-primary" : "text-foreground"
                  }`}
                >
                  {c.nome}
                </span>
              </button>
            );
          })}
          {!showAllCats && cats.length > compactCount && (
            <button
              onClick={() => setShowAllCats(true)}
              className="flex shrink-0 flex-col items-center gap-1.5"
            >
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted text-lg font-bold text-primary shadow-sm transition-all hover:scale-[1.03] sm:h-[72px] sm:w-[72px]">
                +{cats.length - compactCount}
              </div>
              <span className="text-center text-[11px] font-semibold leading-tight text-primary sm:text-xs">
                Ver todas
              </span>
            </button>
          )}
        </div>
        {showAllCats && (
          <button
            onClick={() => setShowAllCats(false)}
            className="w-full rounded-xl border border-border bg-card py-2 text-xs font-bold text-primary"
          >
            Ver menos
          </button>
        )}
      </section>

      {/* Restaurantes próximos */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-foreground">
            {catSel ? cats.find((c) => c.id === catSel)?.nome : "Restaurantes próximos"}
          </h2>
          {catSel ? (
            <button onClick={() => setCatSel(null)} className="text-xs font-bold text-primary">
              Ver todos
            </button>
          ) : (
            <Link to="/cliente/buscar" className="text-xs font-bold text-primary">
              Ver todos
            </Link>
          )}
        </div>
        <div className="grid w-full grid-cols-3 gap-2">
          {([
            ["recomendados", "Recomendados"],
            ["reviews", "Mais avaliados"],
            ["vendas", "Mais vendidos"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSortBy(k)}
              className={`rounded-full border px-2 py-1.5 text-[11px] font-semibold transition-colors sm:text-xs ${
                sortBy === k
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">Nenhum estabelecimento encontrado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((e) => (
              <EstabRow
                key={e.id}
                estab={e}
                hasPromo={promoIds.has(e.id)}
                isBestseller={(salesCount[e.id] ?? 0) >= threshold}
                hoje={hoursById[e.id]}
                reviewCount={reviewCountById[e.id] ?? 0}
              />

            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EstabRow({
  estab,
  hasPromo,
  isBestseller,
  hoje,
  reviewCount,
}: {
  estab: Estab;
  hasPromo: boolean;
  isBestseller: boolean;
  hoje?: { abre: string; fecha: string };
  reviewCount: number;
}) {
  return (
    <Link
      to="/cliente/estabelecimento/$id"
      params={{ id: estab.id }}
      className="group relative flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-brand"
    >
      {/* Badge de status: minúsculo no canto superior direito */}
      {estab.is_open ? (
        <span className="absolute right-1.5 top-1.5 z-10 inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1 py-[1px] text-[7px] font-bold uppercase tracking-wide text-emerald-600 ring-1 ring-emerald-500/40">
          <span className="h-[3px] w-[3px] animate-pulse rounded-full bg-emerald-500" />
          Aberto
        </span>
      ) : (
        <span className="absolute right-1.5 top-1.5 z-10 inline-flex items-center rounded-full bg-muted px-1 py-[1px] text-[7px] font-bold uppercase tracking-wide text-muted-foreground ring-1 ring-border">
          Fechado
        </span>
      )}

      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border/60">
        {estab.logo_url || estab.capa_url ? (
          <img
            src={estab.logo_url ?? estab.capa_url ?? ""}
            alt={estab.nome}
            width={160}
            height={160}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-primary to-primary/70 text-xl font-black text-primary-foreground">
            {estab.nome.charAt(0).toUpperCase()}
          </div>
        )}
        {!estab.is_open && (
          <span className="absolute inset-0 grid place-items-center bg-black/55 text-[10px] font-bold uppercase text-white">
            Fechado
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate pr-12 text-base font-extrabold tracking-tight text-foreground">
          {estab.nome}
        </h3>
        {(isBestseller || hasPromo) && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {isBestseller && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-600 ring-1 ring-orange-500/30">
                <Flame className="h-3 w-3" /> Mais vendido
              </span>
            )}
            {hasPromo && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary ring-1 ring-primary/30">
                <Tag className="h-3 w-3" /> Promoção
              </span>
            )}
          </div>
        )}
        <div className="mt-1 flex items-center gap-2 text-[12px] text-muted-foreground">
          {estab.avaliacao != null && (
            <span className="flex items-center gap-0.5 font-semibold text-foreground">
              <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
              {Number(estab.avaliacao).toFixed(1)}
              <span className="ml-0.5 font-normal text-muted-foreground">({reviewCount})</span>
            </span>
          )}
          {estab.tempo_medio_min ? (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                <Clock className="h-3.5 w-3.5 text-primary" />
                {estab.tempo_medio_min}–{estab.tempo_medio_min + 10} min
              </span>
            </>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          Entrega {estab.taxa_entrega_cents === 0 ? (
            <span className="font-bold text-emerald-600">grátis</span>
          ) : (
            fmt(estab.taxa_entrega_cents)
          )}
          {hoje ? (
            <>
              {" · "}
              <span className="font-semibold text-foreground">Hoje {hoje.abre}–{hoje.fecha}</span>
            </>
          ) : null}
        </p>
      </div>

      <ChevronRight className="h-5 w-5 shrink-0 text-primary" />
    </Link>
  );
}
