import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, Star, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/cliente/buscar")({
  component: BuscarPage,
});

type Estab = {
  id: string;
  nome: string;
  descricao: string | null;
  capa_url: string | null;
  taxa_entrega_cents: number;
  tempo_medio_min: number | null;
  avaliacao: number | null;
  is_open: boolean;
};
type Prod = { id: string; nome: string; descricao: string | null; foto_url: string | null; preco_cents: number; establishment_id: string };

const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function BuscarPage() {
  const [q, setQ] = useState("");
  const [estabs, setEstabs] = useState<Estab[]>([]);
  const [prods, setProds] = useState<Prod[]>([]);
  const [reviewCounts, setReviewCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => run(q.trim()), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function run(term: string) {
    if (term.length < 2) { setEstabs([]); setProds([]); setReviewCounts({}); return; }
    setLoading(true);
    const [e, p] = await Promise.all([
      supabase
        .from("establishments")
        .select("id,nome,descricao,capa_url,taxa_entrega_cents,tempo_medio_min,avaliacao,is_open")
        .eq("status", "aprovado")
        .ilike("nome", `%${term}%`)
        .limit(20),
      supabase
        .from("products")
        .select("id,nome,descricao,foto_url,preco_cents,establishment_id")
        .eq("disponivel", true)
        .ilike("nome", `%${term}%`)
        .limit(30),
    ]);
    const estabList = (e.data ?? []) as Estab[];
    setEstabs(estabList);
    setProds((p.data ?? []) as Prod[]);
    const ids = estabList.map((x) => x.id);
    if (ids.length) {
      const { data: revs } = await supabase.from("reviews").select("establishment_id").in("establishment_id", ids);
      const rc: Record<string, number> = {};
      (revs ?? []).forEach((r: any) => {
        if (r.establishment_id) rc[r.establishment_id] = (rc[r.establishment_id] ?? 0) + 1;
      });
      setReviewCounts(rc);
    } else {
      setReviewCounts({});
    }
    setLoading(false);
  }

  const hasResult = estabs.length + prods.length > 0;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Restaurantes, pratos, categorias..." className="pl-9" autoFocus />
      </div>

      {loading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}

      {!loading && q.length >= 2 && !hasResult && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">Nada encontrado.</div>
      )}

      {estabs.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold">Restaurantes</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {estabs.map((e) => (
              <Link key={e.id} to="/cliente/estabelecimento/$id" params={{ id: e.id }} className="flex gap-3 rounded-2xl border border-border bg-card p-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-primary/20 to-primary/5">
                  {e.capa_url && <img src={e.capa_url} alt="" className="h-full w-full object-cover" loading="lazy" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{e.nome}</p>
                    {!e.is_open && <Badge variant="secondary" className="text-[10px]">Fechado</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {e.avaliacao != null && <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-primary text-primary" />{Number(e.avaliacao).toFixed(1)}</span>}
                    {e.tempo_medio_min && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{e.tempo_medio_min} min</span>}
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
          <h2 className="text-sm font-bold">Pratos</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {prods.map((p) => (
              <Link key={p.id} to="/cliente/estabelecimento/$id" params={{ id: p.establishment_id }} className="flex gap-3 rounded-2xl border border-border bg-card p-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-primary/20 to-primary/5">
                  {p.foto_url && <img src={p.foto_url} alt="" className="h-full w-full object-cover" loading="lazy" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.nome}</p>
                  {p.descricao && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{p.descricao}</p>}
                  <p className="mt-1 text-sm font-bold text-primary">{fmt(p.preco_cents)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
