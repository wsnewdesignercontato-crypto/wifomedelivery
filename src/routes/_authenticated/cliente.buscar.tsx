import { productSummary } from "@/lib/product-details";
import { Button } from "@/components/ui/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Loader2, Star, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/cliente/buscar")({
  head: () => ({
    meta: [
      { title: "Cliente — Buscar | PedeTrem" },
      { name: "description", content: "PedeTrem: cliente, buscar." },
      { property: "og:title", content: "Cliente — Buscar | PedeTrem" },
      { property: "og:description", content: "PedeTrem: cliente, buscar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuscarPage,
});

type Estab = {
  categoria_nome?: string | null;
  id: string;
  nome: string;
  descricao: string | null;
  capa_url: string | null;
  taxa_entrega_cents: number;
  tempo_medio_min: number | null;
  avaliacao: number | null;
  is_open: boolean;
};
type Prod = {
  id: string;
  nome: string;
  descricao: string | null;
  foto_url: string | null;
  preco_cents: number;
  preco_promo_cents?: number | null;
  establishment_id: string;
};

const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function BuscarPage() {
  const [q, setQ] = useState("");
  const [estabs, setEstabs] = useState<Estab[]>([]);
  const [prods, setProds] = useState<Prod[]>([]);
  const [reviewCounts, setReviewCounts] = useState<Record<string, number>>({});
  const [sortBy, setSortBy] = useState<"relevancia" | "rating" | "reviews">("relevancia");
  const [loading, setLoading] = useState(false);
  const [activeCidade, setActiveCidade] = useState<string | null>(null);
  const sequence = useRef(0);
  const [offset, setOffset] = useState(0);
  const [totalStores, setTotalStores] = useState(0),
    [totalProducts, setTotalProducts] = useState(0);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;
      const { data } = await supabase
        .from("profiles")
        .select("cidade_ativa")
        .eq("id", auth.user.id)
        .maybeSingle();
      setActiveCidade((data as { cidade_ativa?: string | null } | null)?.cidade_ativa ?? null);
    })();
  }, []);

  const run = useCallback(
    async (term: string, pageOffset: number, request: number) => {
      setLoading(true);
      setLoadError(false);
      setOffset(pageOffset);
      try {
        const response = await supabase.rpc("search_delivery_catalog", {
          p_query: term,
          p_city: activeCidade,
          p_offset: pageOffset,
          p_limit: 24,
        });
        if (response.error) throw response.error;
        const result = response.data as unknown as {
          establishments: Estab[];
          products: Prod[];
          establishment_total: number;
          product_total: number;
        };
        if (!result || !Array.isArray(result.establishments) || !Array.isArray(result.products))
          throw new Error("invalid");
        if (sequence.current !== request) return;
        setEstabs((previous) =>
          pageOffset
            ? [
                ...new Map(
                  [...previous, ...result.establishments].map((item) => [item.id, item]),
                ).values(),
              ]
            : result.establishments,
        );
        setProds((previous) =>
          pageOffset
            ? [
                ...new Map(
                  [...previous, ...result.products].map((item) => [item.id, item]),
                ).values(),
              ]
            : result.products,
        );
        setTotalStores(result.establishment_total);
        setTotalProducts(result.product_total);
        setOffset(pageOffset);
        const ids = result.establishments.map((item) => item.id);
        const counts: Record<string, number> = {};
        if (ids.length) {
          const reviews = await supabase
            .from("public_reviews")
            .select("establishment_id")
            .in("establishment_id", ids);
          for (const row of reviews.data ?? [])
            if (row.establishment_id)
              counts[row.establishment_id] = (counts[row.establishment_id] ?? 0) + 1;
        }
        if (sequence.current === request)
          setReviewCounts((previous) => (pageOffset ? { ...previous, ...counts } : counts));
      } catch {
        if (sequence.current === request) {
          setLoadError(true);
          if (!pageOffset) {
            setEstabs([]);
            setProds([]);
            setReviewCounts({});
            setTotalStores(0);
            setTotalProducts(0);
          }
        }
      } finally {
        if (sequence.current === request) setLoading(false);
      }
    },
    [activeCidade],
  );
  useEffect(() => {
    const requests = sequence;
    const request = ++requests.current;
    const term = q.trim();
    if (term.length < 2) {
      setEstabs([]);
      setProds([]);
      setReviewCounts({});
      setTotalStores(0);
      setTotalProducts(0);
      setLoadError(false);
      setLoading(false);
      return;
    }
    const timeout = setTimeout(() => void run(term, 0, request), 250);
    return () => {
      clearTimeout(timeout);
      if (requests.current === request) requests.current++;
    };
  }, [q, run]);

  const sortedEstabs = useMemo(() => {
    if (sortBy === "relevancia") return estabs;
    const arr = [...estabs];
    if (sortBy === "rating") {
      arr.sort(
        (a, b) =>
          Number(b.avaliacao ?? 0) - Number(a.avaliacao ?? 0) ||
          (reviewCounts[b.id] ?? 0) - (reviewCounts[a.id] ?? 0),
      );
    } else {
      arr.sort(
        (a, b) =>
          (reviewCounts[b.id] ?? 0) - (reviewCounts[a.id] ?? 0) ||
          Number(b.avaliacao ?? 0) - Number(a.avaliacao ?? 0),
      );
    }
    return arr;
  }, [estabs, sortBy, reviewCounts]);

  const hasResult = estabs.length + prods.length > 0;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Restaurantes, pratos, categorias..."
          className="pl-9"
          autoFocus
        />
      </div>

      {loading && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}

      {!loading && !loadError && q.length >= 2 && !hasResult && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Nada encontrado.
        </div>
      )}

      {estabs.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold">Estabelecimentos</h2>
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
              {(
                [
                  ["relevancia", "Relevância"],
                  ["rating", "Melhor avaliados"],
                  ["reviews", "Mais avaliados"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setSortBy(k)}
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    sortBy === k
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {sortedEstabs.map((e) => (
              <Link
                key={e.id}
                to="/cliente/estabelecimento/$id"
                params={{ id: e.id }}
                className="flex gap-3 rounded-2xl border border-border bg-card p-3"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-primary/20 to-primary/5">
                  {e.capa_url && (
                    <img
                      src={e.capa_url}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{e.nome}</p>
                    {e.categoria_nome && (
                      <Badge variant="secondary" className="text-[10px]">
                        {e.categoria_nome}
                      </Badge>
                    )}
                    {!e.is_open && (
                      <Badge variant="secondary" className="text-[10px]">
                        Fechado
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {e.avaliacao != null && (
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-primary text-primary" />
                        {Number(e.avaliacao).toFixed(1)}{" "}
                        <span className="text-muted-foreground">({reviewCounts[e.id] ?? 0})</span>
                      </span>
                    )}
                    {e.tempo_medio_min && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {e.tempo_medio_min} min
                      </span>
                    )}
                    <span>{e.taxa_entrega_cents === 0 ? "Grátis" : fmt(e.taxa_entrega_cents)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {prods.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold">Produtos</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {prods.map((p) => (
              <Link
                key={p.id}
                to="/cliente/estabelecimento/$id"
                params={{ id: p.establishment_id }}
                className="flex gap-3 rounded-2xl border border-border bg-card p-3"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-primary/20 to-primary/5">
                  {p.foto_url && (
                    <img
                      src={p.foto_url}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.nome}</p>
                  {p.descricao && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {productSummary(p.descricao)}
                    </p>
                  )}
                  <p className="mt-1 text-sm font-bold text-primary">
                    {fmt(p.preco_promo_cents ?? p.preco_cents)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
      {loadError && (
        <div role="alert" className="rounded-xl border border-destructive/20 p-4 text-sm">
          Não foi possível carregar a busca.{" "}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void run(q.trim(), offset, ++sequence.current)}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      {!loadError && (estabs.length < totalStores || prods.length < totalProducts) && (
        <Button
          variant="outline"
          className="w-full"
          disabled={loading}
          onClick={() => void run(q.trim(), offset + 24, ++sequence.current)}
        >
          Carregar mais resultados
        </Button>
      )}
    </div>
  );
}
