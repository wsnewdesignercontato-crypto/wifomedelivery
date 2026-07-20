import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Star, Clock, Loader2, Bike } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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

// Ícone + gradiente por slug (fallback usa 🍽️)
const CAT_STYLE: Record<string, { emoji: string; bg: string }> = {
  pizza: { emoji: "🍕", bg: "from-red-100 to-orange-100" },
  hamburguer: { emoji: "🍔", bg: "from-amber-100 to-yellow-100" },
  hamburgueres: { emoji: "🍔", bg: "from-amber-100 to-yellow-100" },
  lanches: { emoji: "🥪", bg: "from-yellow-100 to-orange-100" },
  japonesa: { emoji: "🍣", bg: "from-rose-100 to-pink-100" },
  acai: { emoji: "🍨", bg: "from-purple-100 to-fuchsia-100" },
  sorvete: { emoji: "🍦", bg: "from-sky-100 to-blue-100" },
  doces: { emoji: "🍰", bg: "from-pink-100 to-rose-100" },
  bebidas: { emoji: "🥤", bg: "from-cyan-100 to-teal-100" },
  saudavel: { emoji: "🥗", bg: "from-emerald-100 to-lime-100" },
  padaria: { emoji: "🥐", bg: "from-amber-100 to-orange-100" },
  marmita: { emoji: "🍱", bg: "from-orange-100 to-red-100" },
  mercado: { emoji: "🛒", bg: "from-red-100 to-orange-100" },
  farmacia: { emoji: "💊", bg: "from-blue-100 to-cyan-100" },
  pastel: { emoji: "🥟", bg: "from-yellow-100 to-amber-100" },
};

function catStyle(slug: string) {
  return CAT_STYLE[slug] ?? { emoji: "🍽️", bg: "from-orange-100 to-red-100" };
}

function ClienteHome() {
  const navigate = useNavigate();
  const [cats, setCats] = useState<Categoria[]>([]);
  const [estabs, setEstabs] = useState<Estab[]>([]);
  const [catSel, setCatSel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [c, e] = await Promise.all([
        supabase.from("global_categories").select("id,nome,slug,icone").eq("ativo", true).order("ordem"),
        supabase
          .from("establishments")
          .select("id,nome,descricao,categoria_id,logo_url,capa_url,taxa_entrega_cents,tempo_medio_min,avaliacao,is_open,cidade")
          .eq("status", "aprovado")
          .order("avaliacao", { ascending: false, nullsFirst: false }),
      ]);
      setCats((c.data ?? []) as Categoria[]);
      setEstabs((e.data ?? []) as Estab[]);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(
    () => (catSel ? estabs.filter((e) => e.categoria_id === catSel) : estabs),
    [estabs, catSel],
  );

  return (
    <div className="space-y-6">
      {/* Categorias — círculos coloridos horizontais */}
      <section className="-mx-4">
        <div className="scrollbar-hide flex gap-4 overflow-x-auto px-4 pb-1">
          {cats.map((c) => {
            const st = catStyle(c.slug);
            const active = catSel === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setCatSel(active ? null : c.id)}
                className="flex w-16 shrink-0 flex-col items-center gap-1.5"
              >
                <div
                  className={`grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br ${st.bg} text-2xl shadow-sm transition-all ${
                    active ? "ring-2 ring-primary ring-offset-2 scale-105" : "hover:scale-105"
                  }`}
                >
                  <span aria-hidden>{st.emoji}</span>
                </div>
                <span className={`text-center text-[11px] font-semibold leading-tight ${active ? "text-primary" : "text-foreground"}`}>
                  {c.nome}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Banner promocional premium */}
      <button
        onClick={() => navigate({ to: "/cliente/buscar" })}
        className="relative block w-full overflow-hidden rounded-2xl bg-gradient-to-r from-primary via-[hsl(19,100%,50%)] to-[hsl(14,100%,52%)] p-5 text-left text-primary-foreground shadow-brand"
      >
        <div className="relative z-10 max-w-[65%]">
          <p className="text-xs font-bold uppercase tracking-widest opacity-90">Promoção especial</p>
          <p className="mt-1 text-2xl font-black leading-tight">
            até <span className="text-white drop-shadow">50% OFF</span>
          </p>
          <span className="mt-3 inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-bold text-primary shadow">
            Ver ofertas
          </span>
        </div>
        <div className="pointer-events-none absolute -right-2 -bottom-2 text-8xl opacity-90 drop-shadow-xl">
          🍔
        </div>
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
      </button>

      {/* Restaurantes */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">Nenhum estabelecimento encontrado.</p>
        </div>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-foreground">
              {catSel ? cats.find((c) => c.id === catSel)?.nome : "Restaurantes perto de você"}
            </h2>
            {catSel && (
              <button
                onClick={() => setCatSel(null)}
                className="text-xs font-bold text-primary"
              >
                Ver todos
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((e) => (
              <EstabCard key={e.id} estab={e} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function EstabCard({ estab }: { estab: Estab }) {
  return (
    <Link
      to="/cliente/estabelecimento/$id"
      params={{ id: estab.id }}
      className="group block overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-brand"
    >
      <div className="relative h-24 w-full bg-gradient-to-br from-primary/15 to-primary/5">
        {estab.capa_url ? (
          <img
            src={estab.capa_url}
            alt={estab.nome}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-3xl opacity-40">🍽️</div>
        )}
        {!estab.is_open && (
          <span className="absolute inset-0 grid place-items-center bg-black/50 text-[11px] font-bold uppercase text-white">
            Fechado
          </span>
        )}
        {estab.taxa_entrega_cents === 0 && estab.is_open && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-black uppercase text-white shadow">
            <Bike className="h-3 w-3" /> Grátis
          </span>
        )}
      </div>
      <div className="p-2.5">
        <h3 className="truncate text-sm font-bold text-foreground">{estab.nome}</h3>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          {estab.avaliacao != null && (
            <span className="flex items-center gap-0.5 font-semibold text-foreground">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              {Number(estab.avaliacao).toFixed(1)}
            </span>
          )}
          <span aria-hidden>·</span>
          {estab.tempo_medio_min && (
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {estab.tempo_medio_min} min
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          Entrega {estab.taxa_entrega_cents === 0 ? "grátis" : fmt(estab.taxa_entrega_cents)}
        </p>
      </div>
    </Link>
  );
}
