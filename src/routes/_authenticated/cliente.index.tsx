import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Star, ChevronRight, Loader2, Tag, Flame } from "lucide-react";
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
import bannerScooter from "@/assets/banner-scooter.png";

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

  useEffect(() => {
    (async () => {
      const nowIso = new Date().toISOString();
      const [c, e, cp, od, ps] = await Promise.all([
        supabase.from("global_categories").select("id,nome,slug,icone").eq("ativo", true).order("ordem"),
        supabase
          .from("establishments")
          .select("id,nome,descricao,categoria_id,logo_url,capa_url,taxa_entrega_cents,tempo_medio_min,avaliacao,is_open,cidade")
          .eq("status", "aprovado")
          .order("avaliacao", { ascending: false, nullsFirst: false }),
        supabase
          .from("coupons")
          .select("establishment_id,expires_at,ativo")
          .eq("ativo", true),
        supabase
          .from("orders")
          .select("establishment_id")
          .eq("status", "delivered"),
        supabase.from("platform_settings").select("bestseller_threshold").eq("id", 1).maybeSingle(),
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
      if (ps.data?.bestseller_threshold) setThreshold(ps.data.bestseller_threshold);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(
    () => (catSel ? estabs.filter((e) => e.categoria_id === catSel) : estabs),
    [estabs, catSel],
  );

  const visibleCats = showAllCats ? cats : cats.slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Banner escuro: Frete grátis */}
      <button
        onClick={() => navigate({ to: "/cliente/buscar" })}
        className="relative block w-full overflow-hidden rounded-2xl bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 p-5 text-left text-white shadow-brand"
      >
        <div className="relative z-10 max-w-[60%]">
          <p className="text-2xl font-black leading-tight">Frete grátis</p>
          <p className="mt-1 text-sm font-medium text-white/80">nas suas primeiras</p>
          <p className="text-2xl font-black leading-tight text-primary">3 entregas</p>
        </div>
        <img
          src={bannerScooter}
          alt="Scooter de entrega"
          width={240}
          height={160}
          loading="lazy"
          className="pointer-events-none absolute -right-2 bottom-0 h-[110%] w-auto object-contain drop-shadow-2xl"
        />
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/30 blur-3xl" />
      </button>

      {/* Categorias - uma única fileira horizontal */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-foreground">Categorias</h2>
          <button
            onClick={() => setShowAllCats((v) => !v)}
            className="text-xs font-bold text-primary"
          >
            {showAllCats ? "Ver menos" : "Ver todas"}
          </button>
        </div>
        <div className="-mx-1 flex gap-3 overflow-x-auto pb-1 scrollbar-hide snap-x snap-mandatory">
          {visibleCats.map((c) => {
            const img = CAT_IMG[c.slug];
            const active = catSel === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setCatSel(active ? null : c.id)}
                className="flex shrink-0 snap-start flex-col items-center gap-1.5"
                style={{ width: "72px" }}
              >
                <div
                  className={`aspect-square w-full overflow-hidden rounded-2xl bg-muted shadow-sm transition-all ${
                    active ? "ring-2 ring-primary ring-offset-2 scale-[1.03]" : "hover:scale-[1.03]"
                  }`}
                >
                  {img ? (
                    <img
                      src={img}
                      alt={c.nome}
                      width={144}
                      height={144}
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
                  className={`text-center text-[11px] font-semibold leading-tight ${
                    active ? "text-primary" : "text-foreground"
                  }`}
                >
                  {c.nome}
                </span>
              </button>
            );
          })}
          {!showAllCats && cats.length > 4 && (
            <button
              onClick={() => setShowAllCats(true)}
              className="flex shrink-0 snap-start flex-col items-center gap-1.5"
              style={{ width: "72px" }}
            >
              <div className="grid aspect-square w-full place-items-center rounded-2xl bg-primary/10 text-primary shadow-sm transition-all hover:scale-[1.03]">
                <span className="text-2xl font-black">+</span>
              </div>
              <span className="text-center text-[11px] font-semibold leading-tight text-primary">
                Ver todas
              </span>
            </button>
          )}
        </div>
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

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">Nenhum estabelecimento encontrado.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((e) => (
              <EstabRow key={e.id} estab={e} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EstabRow({ estab }: { estab: Estab }) {
  return (
    <Link
      to="/cliente/estabelecimento/$id"
      params={{ id: estab.id }}
      className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-brand"
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
        {estab.capa_url || estab.logo_url ? (
          <img
            src={estab.capa_url ?? estab.logo_url ?? ""}
            alt={estab.nome}
            width={160}
            height={160}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-primary/15 to-primary/5 text-2xl opacity-60">
            🍽️
          </div>
        )}
        {!estab.is_open && (
          <span className="absolute inset-0 grid place-items-center bg-black/55 text-[10px] font-bold uppercase text-white">
            Fechado
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-bold text-foreground">{estab.nome}</h3>
        <div className="mt-1 flex items-center gap-2 text-[12px] text-muted-foreground">
          {estab.avaliacao != null && (
            <span className="flex items-center gap-0.5 font-semibold text-foreground">
              <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
              {Number(estab.avaliacao).toFixed(1)}
            </span>
          )}
          {estab.tempo_medio_min && (
            <>
              <span aria-hidden>·</span>
              <span>{estab.tempo_medio_min} min</span>
            </>
          )}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          Entrega {estab.taxa_entrega_cents === 0 ? "grátis" : fmt(estab.taxa_entrega_cents)}
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-primary" />
    </Link>
  );
}
